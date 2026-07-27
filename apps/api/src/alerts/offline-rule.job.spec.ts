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
  });
});
