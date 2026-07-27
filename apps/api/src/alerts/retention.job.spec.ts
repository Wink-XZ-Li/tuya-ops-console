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
  });

  it('deletes records older than retention cutoff', async () => {
    process.env.RETENTION_DAYS = '7';
    const prisma = {
      deviceEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      commandLog: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      alert: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
    } as any;
    const job = new RetentionJob(prisma);
    await job.run();

    const cutoff = (prisma.deviceEvent.deleteMany as jest.Mock).mock.calls[0][0].where
      .eventTime.lt as Date;
    const expected = new Date();
    expected.setDate(expected.getDate() - 7);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(2000);

    expect(prisma.alert.deleteMany).toHaveBeenCalledWith({
      where: {
        status: AlertStatus.closed,
        openedAt: { lt: expect.any(Date) },
      },
    });
  });
});
