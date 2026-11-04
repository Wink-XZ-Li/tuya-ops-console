import { consumePartitionBatch, parseDeviceBusRecord, readPartitionConcurrency } from './kafka-batch';
import { DeviceBusMessage } from './device-bus-message';

function record(offset: string, message: DeviceBusMessage | string | null): { offset: string; value: Buffer | null } {
  if (message == null) return { offset, value: null };
  const raw = typeof message === 'string' ? message : JSON.stringify(message);
  return { offset, value: Buffer.from(raw) };
}

function bus(deviceId: string, ts: number): DeviceBusMessage {
  return {
    deviceId,
    bizCode: 'deviceOnline',
    ts,
    productId: 'p1',
    payload: {},
  };
}

describe('consumePartitionBatch', () => {
  const sleep = jest.fn(async () => undefined);

  beforeEach(() => {
    sleep.mockClear();
  });

  it('handles one partition in offset order and can batch the handler call', async () => {
    const seen: string[][] = [];
    const result = await consumePartitionBatch(
      [record('1', bus('a', 1)), record('2', bus('a', 2)), record('3', bus('b', 3))],
      {
        handleMany: async (messages) => {
          seen.push(messages.map((message) => `${message.deviceId}:${message.ts}`));
        },
        maxAttempts: 3,
        retryDelayMs: 200,
        batchSize: 2,
        sleep,
        warn: () => undefined,
        error: () => undefined,
      },
    );

    expect(seen).toEqual([
      ['a:1', 'a:2'],
      ['b:3'],
    ]);
    expect(result.resolvedOffsets).toEqual(['1', '2', '3']);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('skips a poison record and still handles the later offset', async () => {
    const seen: string[] = [];
    const warnings: string[] = [];
    const result = await consumePartitionBatch(
      [record('1', bus('a', 1)), record('2', '{'), record('3', bus('b', 3))],
      {
        handleMany: async (messages) => {
          seen.push(...messages.map((message) => message.deviceId));
        },
        maxAttempts: 2,
        retryDelayMs: 0,
        batchSize: 10,
        sleep,
        warn: (message) => warnings.push(message),
        error: () => undefined,
      },
    );

    expect(seen).toEqual(['a', 'b']);
    expect(result.resolvedOffsets).toEqual(['1', '2', '3']);
    expect(warnings.join('\n')).toContain('reason=invalid-json');
    expect(parseDeviceBusRecord(Buffer.from('{"bizCode":"x"}')).ok).toBe(false);
  });

  it('retries a failing chunk then continues in order without handling the tail first', async () => {
    const calls: string[] = [];
    const errors: string[] = [];
    let failed = 0;
    const result = await consumePartitionBatch(
      [record('1', bus('a', 1)), record('2', bus('bad', 2)), record('3', bus('c', 3))],
      {
        handleMany: async (messages) => {
          calls.push(messages.map((message) => message.deviceId).join(','));
          if (messages.some((message) => message.deviceId === 'bad')) {
            failed += 1;
            throw new Error('db down');
          }
        },
        maxAttempts: 2,
        retryDelayMs: 25,
        batchSize: 1,
        sleep,
        warn: () => undefined,
        error: (message) => errors.push(message),
      },
    );

    expect(calls).toEqual(['a', 'bad', 'bad', 'c']);
    expect(failed).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(25);
    expect(result.resolvedOffsets).toEqual(['1', '2', '3']);
    expect(errors.join('\n')).toContain('policy=skip-and-continue');
    expect(errors.join('\n')).toContain('offset=2');
  });

  it('does not resolve offsets after the batch is marked stale', async () => {
    let stale = false;
    const result = await consumePartitionBatch([record('1', bus('a', 1)), record('2', bus('b', 2))], {
      handleMany: async () => {
        stale = true;
      },
      maxAttempts: 1,
      retryDelayMs: 0,
      batchSize: 1,
      sleep,
      warn: () => undefined,
      error: () => undefined,
      isStale: () => stale,
    });

    expect(result.resolvedOffsets).toEqual([]);
  });

  it('caps cross-partition concurrency from the environment', () => {
    expect(readPartitionConcurrency({})).toBe(4);
    expect(readPartitionConcurrency({ KAFKA_PARTITIONS_CONCURRENCY: '1' })).toBe(1);
    expect(readPartitionConcurrency({ KAFKA_PARTITIONS_CONCURRENCY: '0' })).toBe(4);
    expect(readPartitionConcurrency({ KAFKA_PARTITIONS_CONCURRENCY: '99' })).toBe(32);
  });
});
