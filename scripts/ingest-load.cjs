#!/usr/bin/env node
/**
 * Phase B ingest check: about 50 messages/s for 2 minutes into
 * tuya.device.events, then P95(DeviceEvent.createdAt - message.ts)
 * and consumer lag against the system-health yellow line.
 *
 * The message body starts from scripts/fixtures/sample-kafka-event.json.
 * `ts` is the produce clock (same host as MySQL), `deviceId` is spread so
 * the key still partitions by device. This script does not alter topic
 * partition count.
 *
 *   bash scripts/ingest-load.sh
 *   DURATION_SEC=10 RATE=50 bash scripts/ingest-load.sh
 */
const fs = require('fs');
const path = require('path');
const { Kafka, logLevel } = require('kafkajs');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
loadEnvFile(path.join(ROOT, '.env'));

const brokers = (process.env.KAFKA_BROKERS ?? '127.0.0.1:19092')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const topic = process.env.KAFKA_TOPIC_DEVICE_EVENTS ?? 'tuya.device.events';
const groupId = process.env.KAFKA_GROUP_ID ?? 'tuya-ops-demo';
const rate = positiveInt(process.env.RATE, 50);
const durationSec = positiveInt(process.env.DURATION_SEC, 120);
const deviceCount = positiveInt(process.env.DEVICE_COUNT, 200);
const lagWarn = positiveInt(process.env.SYSTEM_HEALTH_KAFKA_LAG_WARN, 100);
const drainTimeoutSec = positiveInt(process.env.DRAIN_TIMEOUT_SEC, 90);
const apiBase = (process.env.API_BASE ?? 'http://127.0.0.1:3000/api').replace(/\/$/, '');
const adminUser = process.env.ADMIN_USER ?? 'admin';
const adminPass = process.env.ADMIN_PASS ?? 'ChangeMe123!';
const fixturePath =
  process.env.FIXTURE ?? path.join(ROOT, 'scripts/fixtures/sample-kafka-event.json');
const outPath =
  process.env.OUT ?? path.join(ROOT, 'docs/runbooks/ingest-load-result.json');

const runId = `load-${Date.now().toString(36)}`;
const total = rate * durationSec;

function positiveInt(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same rule as apps/api/src/system-health/system-health.kafka.ts partitionLag. */
function partitionLag(high, low, committed) {
  const end = Number(high);
  const start = Number(low);
  if (!Number.isFinite(end)) return 0;
  const commit = committed == null || committed === '' ? Number.NaN : Number(committed);
  if (!Number.isFinite(commit) || commit < 0) {
    const base = Number.isFinite(start) ? start : 0;
    return Math.max(0, end - base);
  }
  return Math.max(0, end - commit);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (root .env or the environment)');
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  if (!fixture.bizCode || !fixture.productId) {
    throw new Error(`Fixture ${fixturePath} needs bizCode and productId`);
  }

  const kafka = new Kafka({
    clientId: 'tuya-ops-ingest-load',
    brokers,
    logLevel: logLevel.NOTHING,
  });
  const admin = kafka.admin();
  const producer = kafka.producer();
  const prisma = new PrismaClient();
  await admin.connect();
  await producer.connect();

  const report = {
    runId,
    startedAt: new Date().toISOString(),
    fixture: path.relative(ROOT, fixturePath),
    brokers,
    topic,
    groupId,
    rate,
    durationSec,
    deviceCount,
    sent: 0,
    lagWarn,
    partitions: null,
    produce: null,
    latencyMs: null,
    lag: null,
    systemHealth: null,
    pass: false,
    notes: [],
  };

  try {
    const meta = await describeTopic(admin);
    report.partitions = meta;
    if (!meta.exists) {
      report.notes.push(
        'Topic did not exist yet. This script does not create or expand partitions; start the API consumer (or create the topic) first.',
      );
    }
    const ready = await waitForConsumer(admin, 60_000);
    report.consumerReady = ready;
    if (!ready.joined) {
      throw new Error(
        `Consumer group ${groupId} had no members after 60s. Start one API process before this script.`,
      );
    }

    const produce = await produceLoad(producer, admin, fixture);
    report.sent = produce.sent;
    report.produce = {
      elapsedMs: produce.elapsedMs,
      achievedPerSec: Number((produce.sent / (produce.elapsedMs / 1000)).toFixed(2)),
      lagSamples: produce.lagSamples,
    };

    const drained = await drain(admin, prisma);
    report.stored = drained.stored;
    report.latencyMs = drained.latencyMs;
    report.lag = drained.lag;
    const producePeak = (report.produce?.lagSamples ?? []).reduce(
      (max, sample) => Math.max(max, Number(sample.lag) || 0),
      0,
    );
    report.lag.peakDuringProduce = producePeak;
    report.lag.peak = Math.max(report.lag.peak, producePeak);
    report.systemHealth = drained.systemHealth;
    report.pass = Boolean(
      drained.stored === produce.sent &&
        drained.latencyMs &&
        drained.latencyMs.p95 != null &&
        drained.latencyMs.p95 <= 5000 &&
        drained.lag.final != null &&
        drained.lag.final <= lagWarn,
    );
    if (drained.stored !== produce.sent) {
      report.notes.push(
        `Stored ${drained.stored} of ${produce.sent} messages before the drain timeout.`,
      );
    }
    if (drained.latencyMs?.p95 != null && drained.latencyMs.p95 > 5000) {
      report.notes.push(`P95 ${drained.latencyMs.p95}ms is above 5000ms.`);
    }
    if (drained.lag.final == null || drained.lag.final > lagWarn) {
      report.notes.push(
        `Final consumer lag ${drained.lag.final} is above the system-health yellow line ${lagWarn}.`,
      );
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    await producer.disconnect().catch(() => undefined);
    await admin.disconnect().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.pass) process.exitCode = 1;
}

async function describeTopic(admin) {
  const listed = await admin.listTopics();
  if (!listed.includes(topic)) return { exists: false, count: 0 };
  const described = await admin.fetchTopicMetadata({ topics: [topic] });
  const found = described.topics.find((item) => item.name === topic);
  return { exists: true, count: found?.partitions?.length ?? 0 };
}

async function waitForConsumer(admin, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const described = await admin.describeGroups([groupId]);
    const group = described.groups[0];
    last = {
      state: group?.state ?? null,
      members: group?.members?.length ?? 0,
    };
    if (last.members > 0 && (last.state === 'Stable' || last.state === 'CompletingRebalance')) {
      return { joined: true, ...last };
    }
    await sleep(1000);
  }
  return { joined: false, ...(last ?? { state: null, members: 0 }) };
}

async function readLag(admin) {
  const ends = await admin.fetchTopicOffsets(topic);
  let committed = [];
  try {
    const fetched = await admin.fetchOffsets({
      groupId,
      topics: [topic],
      resolveOffsets: false,
    });
    committed = fetched.find((item) => item.topic === topic)?.partitions ?? [];
  } catch {
    committed = [];
  }
  const commits = new Map(committed.map((row) => [row.partition, row.offset]));
  const lag = ends.reduce(
    (sum, end) => sum + partitionLag(end.high, end.low, commits.get(end.partition)),
    0,
  );
  return { lag, partitions: ends.length };
}

async function produceLoad(producer, admin, fixture) {
  const started = Date.now();
  const lagSamples = [];
  let sent = 0;
  let nextSampleAt = started;
  let sample = Promise.resolve();
  const chunk = Math.max(1, Math.round(rate / 10));
  while (sent < total) {
    const due = started + (sent / rate) * 1000;
    const wait = due - Date.now();
    if (wait > 2) await sleep(wait);
    const batch = [];
    const take = Math.min(chunk, total - sent);
    for (let i = 0; i < take; i += 1) {
      const seq = sent + i;
      const ts = Date.now();
      const deviceId = `load-${runId}-${seq % deviceCount}`;
      const message = {
        bizCode: fixture.bizCode,
        ts,
        productId: fixture.productId,
        deviceId,
        payload: {
          ...(fixture.payload && typeof fixture.payload === 'object' ? fixture.payload : {}),
          loadRunId: runId,
          seq,
        },
      };
      batch.push({ key: deviceId, value: JSON.stringify(message) });
    }
    await producer.send({ topic, messages: batch });
    sent += batch.length;
    if (Date.now() >= nextSampleAt) {
      nextSampleAt = Date.now() + 2000;
      sample = readLag(admin)
        .then((row) => {
          lagSamples.push({ at: new Date().toISOString(), lag: row.lag, phase: 'produce' });
        })
        .catch(() => undefined);
    }
  }
  await sample;
  return { sent, elapsedMs: Date.now() - started, lagSamples };
}

async function drain(admin, prisma) {
  const deadline = Date.now() + drainTimeoutSec * 1000;
  const lagSamples = [];
  let rows = [];
  let lag = null;
  let systemHealth = null;
  while (Date.now() < deadline) {
    lag = await readLag(admin);
    rows = await fetchRows(prisma);
    lagSamples.push({
      at: new Date().toISOString(),
      lag: lag.lag,
      stored: rows.length,
    });
    if (lagSamples.length % 5 === 1) {
      systemHealth = await readSystemHealth();
    }
    if (rows.length >= total && lag.lag <= lagWarn) break;
    await sleep(1000);
  }
  systemHealth = (await readSystemHealth()) ?? systemHealth;
  const latencies = rows
    .map((row) => Number(row.latencyMs))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  return {
    stored: rows.length,
    latencyMs: latencies.length
      ? {
          n: latencies.length,
          min: latencies[0],
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          p99: percentile(latencies, 99),
          max: latencies[latencies.length - 1],
        }
      : null,
    lag: {
      warn: lagWarn,
      samples: lagSamples,
      peak: lagSamples.reduce((max, sample) => Math.max(max, sample.lag), 0),
      final: lag ? lag.lag : null,
      recoveredUnderWarn: lag != null && lag.lag <= lagWarn,
    },
    systemHealth,
  };
}

async function fetchRows(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT TIMESTAMPDIFF(MICROSECOND, eventTime, createdAt) / 1000 AS latencyMs
     FROM DeviceEvent
     WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.loadRunId')) = ?`,
    runId,
  );
  return rows.map((row) => ({ latencyMs: asNumber(row.latencyMs) }));
}

function asNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  if (value != null && typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return Number(value);
}

async function readSystemHealth() {
  try {
    const loginRes = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: adminUser, password: adminPass }),
    });
    if (!loginRes.ok) {
      return { ok: false, status: loginRes.status };
    }
    const loginBody = await loginRes.json();
    const token = loginBody.accessToken;
    if (!token) return { ok: false, status: loginRes.status, error: 'missing accessToken' };
    const healthRes = await fetch(`${apiBase}/system-health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!healthRes.ok) return { ok: false, status: healthRes.status };
    const report = await healthRes.json();
    const kafka = Array.isArray(report.components)
      ? report.components.find((item) => item.key === 'kafka_consumer')
      : null;
    const lagIssue = Array.isArray(report.issues)
      ? report.issues.find((item) => item.code === 'KAFKA_LAG')
      : null;
    return {
      ok: true,
      overall: report.status,
      checkedAt: report.checkedAt,
      kafkaConsumer: kafka ?? null,
      kafkaLagIssue: lagIssue ?? null,
      issueCodes: Array.isArray(report.issues)
        ? report.issues.map((item) => ({ code: item.code, severity: item.severity }))
        : [],
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
