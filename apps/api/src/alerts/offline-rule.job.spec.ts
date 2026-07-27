import { OfflineRuleJob } from './offline-rule.job';

describe('OfflineRuleJob', () => {
  it('does not duplicate open local_offline alerts', async () => {
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
    const job = new OfflineRuleJob(prisma, 30);
    await job.run();
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });
});
