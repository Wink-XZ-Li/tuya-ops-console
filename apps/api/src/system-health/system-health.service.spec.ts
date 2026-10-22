import { SystemHealthService } from './system-health.service';
import type { ProbeSignals } from './system-health.types';

describe('SystemHealthService', () => {
  const now = Date.parse('2026-10-22T02:00:00.000Z');

  function healthySignals(): ProbeSignals {
    return {
      now,
      demoMode: 'live',
      mysqlOk: true,
      mysqlLatencyMs: 3,
      kafkaReachable: true,
      consumer: {
        state: 'Stable',
        memberCount: 1,
        lag: 0,
        highWatermark: 4,
        topicHasRecentMessage: true,
      },
      deviceEventMaxAt: now - 1_000,
      deviceLastSeenMaxAt: now - 1_000,
      deviceCount: 1,
    };
  }

  function service(auditCreate: jest.Mock, signals = healthySignals()) {
    const prisma = { auditLog: { create: auditCreate } };
    const collector = { collect: jest.fn().mockResolvedValue(signals) };
    return new SystemHealthService(prisma as never, collector as never);
  }

  it('does not write an audit log for a plain read', async () => {
    const auditCreate = jest.fn();
    const report = await service(auditCreate).inspect();
    expect(report.status).toBe('healthy');
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('records a manual check and still returns the report if the audit write fails', async () => {
    const auditCreate = jest.fn().mockRejectedValue(new Error('mysql down'));
    const report = await service(auditCreate).inspect({ auditUserId: 'admin-1' });

    expect(report.status).toBe('healthy');
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: 'admin-1',
        action: 'system-health.check',
        resource: 'system-health',
      }),
    });
  });
});
