import { AlertStatus } from '@prisma/client';
import { RetentionJob } from './retention.job';

describe('RetentionJob', () => {
  const originalEnv = process.env.RETENTION_DAYS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RETENTION_DAYS;
    } else {
      process.env.RETENTION_DAYS = originalEnv;
    }
    delete process.env.RETENTION_DRY_RUN;
    delete process.env.RETENTION_BATCH_SIZE;
    delete process.env.EVENT_HOT_DAYS;
  });

  function prisma(): any {
    return {
      deviceEvent: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      deviceEventArchive: { count: jest.fn().mockResolvedValue(0) },
      commandLog: { count: jest.fn().mockResolvedValue(0) },
      auditLog: { count: jest.fn().mockResolvedValue(0) },
      alert: { count: jest.fn().mockResolvedValue(0) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn().mockResolvedValue([]),
    };
  }

  it('dry-run counts batches and does not delete', async () => {
    process.env.RETENTION_DAYS = '90';
    process.env.RETENTION_BATCH_SIZE = '1000';
    const db = prisma();
    db.deviceEvent.count
      .mockResolvedValueOnce(2500)
      .mockResolvedValueOnce(400);
    db.deviceEventArchive.count.mockResolvedValue(1500);
    db.commandLog.count.mockResolvedValue(10);
    const job = new RetentionJob(db as any);
    const report = await job.run({ dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.hotExpired).toBe(2500);
    expect(report.toArchive).toBe(400);
    expect(report.archiveExpired).toBe(1500);
    expect(report.batches).toBe(3 + 1 + 2 + 1);
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(db.deviceEvent.findMany).not.toHaveBeenCalled();
    const cutoff = job.getCutoffDate();
    const expected = new Date();
    expected.setDate(expected.getDate() - 90);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(2000);
  });

  it('deletes each table with a bounded LIMIT and archives by id batch', async () => {
    process.env.RETENTION_DAYS = '90';
    process.env.RETENTION_BATCH_SIZE = '1000';
    process.env.EVENT_HOT_DAYS = '14';
    const db = prisma();
    const deleted: string[] = [];
    db.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      deleted.push(sql);
      return 3;
    });
    const row = {
      id: 'evt-1',
      deviceId: 'dev-1',
      bizCode: 'devicePropertyMessage',
      payload: { ok: true },
      eventTime: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    db.deviceEvent.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    db.deviceEventArchive.createMany = jest.fn().mockResolvedValue({ count: 1 });
    const job = new RetentionJob(db as any);
    const report = await job.run();

    expect(report.dryRun).toBe(false);
    expect(report.eventsArchived).toBe(1);
    expect(report.eventsDeleted).toBe(3);
    expect(report.stoppedEarly).toBe(false);
    expect(deleted.some((sql) => sql.startsWith('DELETE FROM DeviceEvent ') && sql.includes('LIMIT 1000'))).toBe(
      true,
    );
    expect(deleted.some((sql) => sql.includes('DeviceEventArchive') && sql.includes('LIMIT 1000'))).toBe(true);
    expect(deleted.some((sql) => sql.includes("status = 'closed'") && sql.includes('LIMIT 1000'))).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.alert.count).toHaveBeenCalledWith({
      where: { status: AlertStatus.closed, openedAt: { lt: expect.any(Date) } },
    });
  });
});
