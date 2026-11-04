#!/usr/bin/env node
/**
 * Phase C query check: >=3000 devices, 7 days of events, fault dashboard
 * and device-list SQL under 2s. Detail history is paged at 400 rows.
 *
 *   bash scripts/query-load.sh
 *   DEVICE_COUNT=3000 EVENT_DAYS=7 bash scripts/query-load.sh
 *
 * Writes docs/runbooks/phase-c-query-result.json and deletes qload-* rows
 * unless KEEP=1.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
loadEnvFile(path.join(ROOT, '.env'));

const deviceCount = positiveInt(process.env.DEVICE_COUNT, 3000);
const eventDays = positiveInt(process.env.EVENT_DAYS, 7);
const budgetMs = positiveInt(process.env.QUERY_BUDGET_MS, 2000);
const pageSize = 400;
const keep = process.env.KEEP === '1';
const outPath = process.env.OUT ?? path.join(ROOT, 'docs/runbooks/phase-c-query-result.json');
const productId = 'qload-product';
const prefix = 'qload-';

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

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function timed(run) {
  const started = Date.now();
  const value = await run();
  return { ms: Date.now() - started, value };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (root .env or the environment)');
  }
  const prisma = new PrismaClient();
  const result = {
    deviceCount,
    eventDays,
    budgetMs,
    seededAt: new Date().toISOString(),
    timingsMs: {},
    explain: {},
    detail: {},
    pass: false,
  };
  try {
    await cleanup(prisma);
    const seeded = await seed(prisma);
    result.seeded = seeded;
    result.timingsMs.deviceList = (await timed(() => listDevices(prisma))).ms;
    result.timingsMs.faultBoard = (await timed(() => faultBoard(prisma))).ms;
    result.timingsMs.deviceListPlusFaults =
      result.timingsMs.deviceList + result.timingsMs.faultBoard;
    const detail = await pageDetail(prisma, seeded.busyInternalId);
    result.detail = detail;
    result.timingsMs.detail7d = detail.ms;
    const retention = await timeRetentionBatch(prisma);
    result.timingsMs.retentionBatch = retention.ms;
    result.retentionBatch = retention;
    await prisma.$queryRawUnsafe(`ANALYZE TABLE Device, DeviceEvent, Alert`);
    result.explain.deviceList = await explain(
      prisma,
      `EXPLAIN SELECT id FROM Device ORDER BY createdAt DESC LIMIT 20`,
    );
    result.explain.faultDistinct = await explain(
      prisma,
      `EXPLAIN SELECT COUNT(DISTINCT a.deviceId) AS n
       FROM Alert a
       INNER JOIN Device d ON d.id = a.deviceId
       WHERE a.category = 'fault' AND a.status <> 'closed'`,
    );
    result.explain.detailPage = await explain(
      prisma,
      `EXPLAIN SELECT id FROM DeviceEvent
       WHERE deviceId = '${seeded.busyInternalId}'
         AND eventTime >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY eventTime ASC
       LIMIT ${pageSize}`,
    );
    result.pass =
      result.timingsMs.deviceListPlusFaults <= budgetMs &&
      detail.maxPageRows <= pageSize &&
      detail.pages > 1 &&
      retention.deleted === 1000 &&
      retention.ms <= budgetMs;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
    if (!result.pass) {
      throw new Error(
        `query benchmark missed the budget: list+faults=${result.timingsMs.deviceListPlusFaults}ms, detail pages=${detail.pages}, maxPage=${detail.maxPageRows}`,
      );
    }
    console.log(JSON.stringify(result.timingsMs));
    console.log(`wrote ${outPath}`);
  } finally {
    if (!keep) await cleanup(prisma).catch((err) => console.error(err));
    await prisma.$disconnect();
  }
}

async function seed(prisma) {
  const now = new Date();
  const devices = [];
  for (let i = 0; i < deviceCount; i += 1) {
    const fault = i % 50 === 0;
    devices.push({
      deviceId: `${prefix}${String(i).padStart(5, '0')}`,
      productId,
      name: `qload ${i}`,
      onlineStatus: i % 4 === 0 ? 'offline' : 'online',
      faultStatus: fault ? 'fault' : 'normal',
      faultInfo: fault ? (i % 100 === 0 ? 'E1' : 'E2') : null,
      statusJson: { mode: i % 2 === 0 ? 'auto' : 'eco' },
    });
  }
  for (let offset = 0; offset < devices.length; offset += 500) {
    await prisma.device.createMany({ data: devices.slice(offset, offset + 500) });
  }
  const rows = await prisma.device.findMany({
    where: { deviceId: { startsWith: prefix } },
    select: { id: true, deviceId: true },
  });
  const busy = rows.find((row) => row.deviceId === `${prefix}00000`);
  if (!busy) throw new Error('busy device missing after seed');

  const metrics = [];
  const faults = [];
  for (let day = 0; day < eventDays; day += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - day);
    const key = ymd(date);
    metrics.push({
      day: key,
      productId,
      onlineCount: deviceCount - Math.floor(deviceCount / 4),
      offlineCount: Math.floor(deviceCount / 4),
      faultCount: Math.floor(deviceCount / 50),
      totalDevices: deviceCount,
      modeCounts: { auto: Math.ceil(deviceCount / 2), eco: Math.floor(deviceCount / 2) },
    });
    faults.push({
      day: key,
      productId,
      faultCode: 'E1',
      openCount: 10,
      newCount: 4,
      closedCount: 3,
      mttrMinutesAvg: 25,
    });
  }
  await prisma.dailyDeviceMetric.createMany({ data: metrics });
  await prisma.dailyFaultStat.createMany({ data: faults });

  const alerts = rows.slice(0, 80).map((row, index) => ({
    deviceId: row.id,
    source: 'bench',
    title: 'E1',
    status: index % 3 === 0 ? 'closed' : 'open',
    category: 'fault',
    faultCode: 'E1',
    openedAt: new Date(now.getTime() - (index % eventDays) * 86400000),
    closedAt: index % 3 === 0 ? now : null,
    activeKey: index % 3 === 0 ? null : `bench:${row.id}:E1`,
  }));
  await prisma.alert.createMany({ data: alerts });

  const events = [];
  for (const row of rows) {
    for (let day = 0; day < eventDays; day += 1) {
      events.push({
        deviceId: row.id,
        bizCode: 'devicePropertyMessage',
        payload: { status: [{ code: 'work_state', value: 'heating' }] },
        eventTime: new Date(now.getTime() - day * 86400000 - 60_000),
      });
    }
  }
  const stepMs = 2 * 60 * 1000;
  const dense = Math.floor((eventDays * 86400000) / stepMs);
  for (let i = 0; i < dense; i += 1) {
    events.push({
      deviceId: busy.id,
      bizCode: 'devicePropertyMessage',
      payload: { status: [{ code: 'work_state', value: i % 2 === 0 ? 'heating' : 'code_standby' }] },
      eventTime: new Date(now.getTime() - i * stepMs),
    });
  }
  for (let offset = 0; offset < events.length; offset += 1000) {
    await prisma.deviceEvent.createMany({ data: events.slice(offset, offset + 1000) });
  }
  return {
    devices: rows.length,
    events: events.length,
    busyInternalId: busy.id,
    busyDeviceId: busy.deviceId,
  };
}

async function listDevices(prisma) {
  const [page, total] = await Promise.all([
    prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.device.count(),
  ]);
  if (page.length !== 20 || total < deviceCount) {
    throw new Error(`device list unexpected page=${page.length} total=${total}`);
  }
}

async function faultBoard(prisma) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (eventDays - 1));
  const startDay = ymd(start);
  const endDay = ymd(end);
  const [daily, distinct, groups] = await Promise.all([
    prisma.dailyFaultStat.findMany({
      where: { day: { gte: startDay, lte: endDay }, productId },
    }),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT a.deviceId) AS n
       FROM Alert a
       INNER JOIN Device d ON d.id = a.deviceId
       WHERE a.category = 'fault' AND a.status <> 'closed' AND d.productId = ?`,
      productId,
    ),
    prisma.device.groupBy({
      by: ['productId', 'onlineStatus', 'faultStatus'],
      where: { productId },
      _count: { _all: true },
    }),
  ]);
  if (daily.length === 0 || groups.length === 0 || distinct.length === 0) {
    throw new Error('fault board returned empty rollup');
  }
}

async function pageDetail(prisma, internalId) {
  const to = new Date();
  const from = new Date(to.getTime() - eventDays * 86400000);
  let cursor = null;
  let pages = 0;
  let rows = 0;
  let maxPageRows = 0;
  const started = Date.now();
  for (;;) {
    const page = await prisma.deviceEvent.findMany({
      where: {
        deviceId: internalId,
      eventTime: {
        gte: from,
        lte: to,
        ...(cursor ? { gt: cursor } : {}),
      },
      },
      orderBy: { eventTime: 'asc' },
      take: pageSize,
      select: { id: true, eventTime: true },
    });
    pages += 1;
    rows += page.length;
    maxPageRows = Math.max(maxPageRows, page.length);
    if (page.length < pageSize) break;
    cursor = page[page.length - 1].eventTime;
    if (pages > 100) throw new Error('detail paging did not finish');
  }
  return { ms: Date.now() - started, pages, rows, maxPageRows };
}

async function timeRetentionBatch(prisma) {
  const old = new Date('2020-01-01T00:00:00.000Z');
  const device = await prisma.device.findFirst({
    where: { deviceId: { startsWith: prefix } },
    select: { id: true },
  });
  const rows = Array.from({ length: 2500 }, (_, index) => ({
    deviceId: device.id,
    bizCode: 'devicePropertyMessage',
    payload: { status: [{ code: 'work_state', value: 'heating' }] },
    eventTime: new Date(old.getTime() + index * 1000),
  }));
  for (let offset = 0; offset < rows.length; offset += 1000) {
    await prisma.deviceEvent.createMany({ data: rows.slice(offset, offset + 1000) });
  }
  const started = Date.now();
  const deleted = Number(
    await prisma.$executeRawUnsafe(
      `DELETE FROM DeviceEvent WHERE eventTime < ? ORDER BY eventTime ASC LIMIT 1000`,
      new Date('2020-02-01T00:00:00.000Z'),
    ),
  );
  return { ms: Date.now() - started, deleted, batchSize: 1000 };
}

async function explain(prisma, sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return rows.map((row) => {
    const named = row.table != null || row.key != null;
    const table = named ? row.table : row.f2;
    const type = named ? row.type : row.f4;
    const key = named ? row.key : row.f6;
    const rawRows = named ? row.rows : row.f9;
    const extra = named ? row.Extra : row.f11;
    const possible = named ? row.possible_keys : row.f5;
    return {
      table: table ?? null,
      type: type ?? null,
      possibleKeys: possible ?? null,
      key: key ?? null,
      rows: rawRows == null ? null : Number(rawRows),
      extra: extra ?? null,
    };
  });
}

async function cleanup(prisma) {
  const devices = await prisma.device.findMany({
    where: { deviceId: { startsWith: prefix } },
    select: { id: true },
  });
  const ids = devices.map((row) => row.id);
  if (ids.length > 0) {
    await prisma.alert.deleteMany({ where: { deviceId: { in: ids } } });
    await prisma.deviceEvent.deleteMany({ where: { deviceId: { in: ids } } });
    await prisma.deviceEventArchive.deleteMany({ where: { deviceId: { in: ids } } }).catch(() => undefined);
    await prisma.device.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.dailyDeviceMetric.deleteMany({ where: { productId } });
  await prisma.dailyFaultStat.deleteMany({ where: { productId, faultCode: 'E1' } });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
