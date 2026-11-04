import { DeviceBusMessage } from './device-bus-message';

/**
 * Kafka ingest failure policy (one path, partition order):
 *
 * 1. Same partition is handled strictly in offset order. deviceId is the
 *    record key, so one device stays on one partition and cannot be reordered
 *    by another partition's concurrency.
 * 2. Poison records (empty value, invalid JSON, missing deviceId / bizCode / ts)
 *    are logged and skipped. The offset advances. They are not retried.
 * 3. A handler throw retries that chunk in-process up to KAFKA_MESSAGE_RETRIES
 *    (total attempts, default 3) with linear backoff
 *    attempt * KAFKA_MESSAGE_RETRY_MS (default 200ms).
 * 4. When retries are exhausted the chunk is skipped and the offset advances
 *    (`policy=skip-and-continue`). The consumer does not stall the partition
 *    and does not crash the group: one bad payload must not block every other
 *    device that hashes to the same partition. Later offsets in the partition
 *    are not handled before this decision.
 * 5. Other partitions may run at the same time, capped by
 *    KAFKA_PARTITIONS_CONCURRENCY (default 4).
 * 6. Delivery is at-least-once. A retry after a successful write can insert a
 *    second DeviceEvent and bump occurrenceCount. There is no idempotency key.
 */
export const KAFKA_MESSAGE_RETRY_POLICY =
  'partition-order; poison=skip; handler-retries=KAFKA_MESSAGE_RETRIES; backoff=attempt*KAFKA_MESSAGE_RETRY_MS; exhausted=skip-and-continue; cross-partition-concurrency=KAFKA_PARTITIONS_CONCURRENCY';

export type InboundKafkaRecord = {
  offset: string;
  value: Buffer | null;
};

export type PartitionBatchDeps = {
  handleMany: (messages: DeviceBusMessage[]) => Promise<void>;
  /** Total attempts, including the first. */
  maxAttempts: number;
  retryDelayMs: number;
  batchSize: number;
  sleep: (ms: number) => Promise<void>;
  warn: (message: string) => void;
  error: (message: string, err?: unknown) => void;
  isRunning?: () => boolean;
  isStale?: () => boolean;
  heartbeat?: () => Promise<void>;
};

export type PartitionBatchResult = {
  resolvedOffsets: string[];
};

export function readPartitionConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env.KAFKA_PARTITIONS_CONCURRENCY, 4, 32);
}

export function readMessageAttempts(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env.KAFKA_MESSAGE_RETRIES, 3, 10);
}

export function readRetryDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.KAFKA_MESSAGE_RETRY_MS ?? 200);
  if (!Number.isFinite(raw) || raw < 0) return 200;
  return Math.min(Math.floor(raw), 60_000);
}

export function readHandlerBatchSize(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env.KAFKA_HANDLER_BATCH, 32, 500);
}

export function parseDeviceBusRecord(
  value: Buffer | null,
): { ok: true; message: DeviceBusMessage } | { ok: false; reason: string } {
  if (!value || value.length === 0) return { ok: false, reason: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.toString());
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not-object' };
  const msg = parsed as Partial<DeviceBusMessage>;
  if (typeof msg.deviceId !== 'string' || !msg.deviceId) return { ok: false, reason: 'shape' };
  if (typeof msg.bizCode !== 'string' || !msg.bizCode) return { ok: false, reason: 'shape' };
  if (typeof msg.ts !== 'number' || !Number.isFinite(msg.ts)) return { ok: false, reason: 'shape' };
  const payload =
    msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
      ? msg.payload
      : {};
  return {
    ok: true,
    message: {
      deviceId: msg.deviceId,
      bizCode: msg.bizCode,
      ts: msg.ts,
      productId: typeof msg.productId === 'string' ? msg.productId : undefined,
      payload,
    },
  };
}

export async function consumePartitionBatch(
  records: InboundKafkaRecord[],
  deps: PartitionBatchDeps,
): Promise<PartitionBatchResult> {
  const resolvedOffsets: string[] = [];
  let index = 0;

  while (index < records.length) {
    if (shouldStop(deps)) break;

    const head = parseDeviceBusRecord(records[index].value);
    if (!head.ok) {
      deps.warn(`Skipping Kafka message offset=${records[index].offset} reason=${head.reason}`);
      resolvedOffsets.push(records[index].offset);
      index += 1;
      continue;
    }

    const chunkRecords: InboundKafkaRecord[] = [];
    const chunkMessages: DeviceBusMessage[] = [];
    while (index < records.length && chunkMessages.length < deps.batchSize && !shouldStop(deps)) {
      const parsed = parseDeviceBusRecord(records[index].value);
      if (!parsed.ok) break;
      chunkRecords.push(records[index]);
      chunkMessages.push(parsed.message);
      index += 1;
    }
    if (chunkMessages.length === 0) continue;

    const handled = await runChunk(chunkMessages, chunkRecords[0].offset, deps);
    if (deps.isStale?.()) break;

    if (!handled.ok) {
      const devices = chunkMessages.map((message) => message.deviceId).join(',');
      deps.error(
        `Kafka handler skipped after retries offset=${chunkRecords[0].offset} devices=${devices} policy=skip-and-continue`,
        handled.error,
      );
    }

    for (const record of chunkRecords) resolvedOffsets.push(record.offset);
    if (deps.heartbeat) await deps.heartbeat();
    if (deps.isRunning && !deps.isRunning()) break;
  }

  return { resolvedOffsets };
}

async function runChunk(
  messages: DeviceBusMessage[],
  offset: string,
  deps: PartitionBatchDeps,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  let lastError: unknown;
  const attempts = Math.max(1, deps.maxAttempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await deps.handleMany(messages);
      return { ok: true };
    } catch (err) {
      lastError = err;
      const devices = messages.map((message) => message.deviceId).join(',');
      deps.error(
        `Kafka handler failed attempt=${attempt}/${attempts} offset=${offset} devices=${devices}`,
        err,
      );
      if (attempt < attempts && deps.retryDelayMs > 0) {
        await deps.sleep(deps.retryDelayMs * attempt);
      }
    }
  }
  return { ok: false, error: lastError };
}

function shouldStop(deps: PartitionBatchDeps): boolean {
  if (deps.isRunning && !deps.isRunning()) return true;
  if (deps.isStale && deps.isStale()) return true;
  return false;
}

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}
