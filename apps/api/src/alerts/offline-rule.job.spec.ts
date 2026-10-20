import { OfflineRuleJob } from './offline-rule.job';

describe('OfflineRuleJob', () => {
  const originalEnv = process.env.OFFLINE_ALERT_MINUTES;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OFFLINE_ALERT_MINUTES;
    } else {
      process.env.OFFLINE_ALERT_MINUTES = originalEnv;
    }
  });

  it('does not duplicate open local_offline alerts', async () => {
    process.env.OFFLINE_ALERT_MINUTES = '30';
    const prisma = {
      device: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: '1', deviceId: 'd1', lastSeenAt: new Date(0) }]),
      },
      alert: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
        create: jest.fn(),
      },
    } as any;
    const job = new OfflineRuleJob(prisma);
    await job.run();
    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(prisma.alert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId: '1',
          status: { not: 'closed' },
        }),
      }),
    );
  });

  it('creates a connectivity offline alert with an active key', async () => {
    process.env.OFFLINE_ALERT_MINUTES = '30';
    const seen = new Date('2026-10-10T00:00:00Z');
    const prisma = {
      device: {
        findMany: jest.fn().mockResolvedValue([{ id: 'dev1', deviceId: 'd1', lastSeenAt: seen }]),
      },
      alert: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
      },
    } as any;
    const job = new OfflineRuleJob(prisma);
    await job.run();
    expect(prisma.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deviceId: 'dev1',
        source: 'local_offline',
        category: 'connectivity',
        faultCode: 'offline',
        activeKey: 'dev1:connectivity:offline',
        fingerprint: 'dev1:connectivity:offline',
        conditionStartedAt: seen,
        occurrenceCount: 1,
      }),
    });
  });
});
