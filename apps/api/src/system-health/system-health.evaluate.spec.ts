import { readSystemHealthConfig } from './system-health.config';
import { evaluateSystemHealth } from './system-health.evaluate';
import type { ProbeSignals } from './system-health.types';

const NOW = Date.parse('2026-10-22T01:00:00.000Z');

const config = {
  staleEventMs: 900_000,
  eventWarnMs: 300_000,
  kafkaLagWarn: 100,
  kafkaLagCrit: 1000,
  mysqlSlowMs: 1000,
  apiSlowMs: 3000,
  groupId: 'tuya-ops-demo',
};

function signals(overrides: Partial<ProbeSignals> = {}): ProbeSignals {
  return {
    now: NOW,
    demoMode: 'live',
    mysqlOk: true,
    mysqlLatencyMs: 4,
    kafkaReachable: true,
    consumer: {
      state: 'Stable',
      memberCount: 1,
      lag: 0,
      highWatermark: 20,
      topicHasRecentMessage: true,
    },
    deviceEventMaxAt: NOW - 60_000,
    deviceLastSeenMaxAt: NOW - 60_000,
    deviceCount: 3,
    ...overrides,
  };
}

function codes(report: { issues: Array<{ code: string }> }): string[] {
  return report.issues.map((issue) => issue.code);
}

describe('evaluateSystemHealth', () => {
  it('is healthy when live data is fresh and dependencies respond', () => {
    const report = evaluateSystemHealth(signals(), config, 12);

    expect(report.status).toBe('healthy');
    expect(report.issues).toEqual([]);
    expect(report.components.map((item) => item.status)).toEqual([
      'healthy',
      'healthy',
      'healthy',
      'healthy',
      'healthy',
      'healthy',
      'healthy',
    ]);
    expect(report.checkedAt).toBe(new Date(NOW).toISOString());
    expect(report.durationMs).toBe(12);
  });

  it('flags a fake-alive bridge when events stopped but lastSeen is still fresh', () => {
    const report = evaluateSystemHealth(
      signals({
        deviceEventMaxAt: NOW - 20 * 60_000,
        deviceLastSeenMaxAt: NOW - 2 * 60_000,
        consumer: {
          state: 'Stable',
          memberCount: 1,
          lag: 0,
          highWatermark: 20,
          topicHasRecentMessage: false,
        },
      }),
      config,
      20,
    );

    expect(codes(report)).toEqual(expect.arrayContaining(['BRIDGE_STALE', 'EVENT_GAP']));
    const stale = report.issues.find((issue) => issue.code === 'BRIDGE_STALE');
    const gap = report.issues.find((issue) => issue.code === 'EVENT_GAP');
    expect(stale?.steps.join('\n')).toContain('pnpm dev:bridge');
    expect(stale?.commands.join('\n')).toContain('pnpm dev:bridge');
    const gapText = `${gap?.impact ?? ''}\n${gap?.steps.join('\n') ?? ''}`;
    expect(gapText).toContain('勿只点「同步设备」');
    expect(gapText).toContain('勿只靠同步');
    expect(report.components.find((item) => item.key === 'bridge')?.status).toBe('critical');
    expect(report.components.find((item) => item.key === 'device_event_freshness')?.status).toBe(
      'critical',
    );
    expect(stale?.status).toBe('open');
    expect(stale?.since).toBe(new Date(NOW - 20 * 60_000).toISOString());
  });

  it('flags BRIDGE_DOWN when events and lastSeen are both stale and Kafka is quiet', () => {
    const report = evaluateSystemHealth(
      signals({
        deviceEventMaxAt: NOW - 30 * 60_000,
        deviceLastSeenMaxAt: NOW - 30 * 60_000,
        consumer: {
          state: 'Stable',
          memberCount: 1,
          lag: 0,
          highWatermark: 8,
          topicHasRecentMessage: false,
        },
      }),
      config,
      10,
    );

    expect(codes(report)).toContain('BRIDGE_DOWN');
    expect(codes(report)).not.toContain('BRIDGE_STALE');
    expect(report.issues.find((issue) => issue.code === 'BRIDGE_DOWN')?.steps.join('\n')).toContain(
      'pnpm dev:bridge',
    );
  });

  it('does not call the bridge down when Kafka still has recent messages', () => {
    const report = evaluateSystemHealth(
      signals({
        deviceEventMaxAt: NOW - 30 * 60_000,
        deviceLastSeenMaxAt: NOW - 30 * 60_000,
        consumer: {
          state: 'Stable',
          memberCount: 1,
          lag: 2500,
          highWatermark: 80,
          topicHasRecentMessage: true,
        },
      }),
      config,
      10,
    );

    expect(codes(report)).toContain('KAFKA_LAG');
    expect(codes(report)).not.toContain('BRIDGE_DOWN');
    expect(codes(report)).not.toContain('BRIDGE_STALE');
    expect(report.issues.find((issue) => issue.code === 'KAFKA_LAG')).toMatchObject({
      severity: 'crit',
      related: { lag: 2500, kafkaHw: 80 },
    });
  });

  it('warns below the hard lag threshold and goes critical at the hard threshold or with no members', () => {
    const warn = evaluateSystemHealth(
      signals({
        consumer: {
          state: 'Stable',
          memberCount: 1,
          lag: 150,
          highWatermark: 150,
          topicHasRecentMessage: true,
        },
      }),
      config,
      5,
    );
    expect(warn.status).toBe('degraded');
    expect(warn.issues).toEqual([
      expect.objectContaining({ code: 'KAFKA_LAG', severity: 'warn' }),
    ]);

    const crit = evaluateSystemHealth(
      signals({
        consumer: {
          state: 'Empty',
          memberCount: 0,
          lag: 0,
          highWatermark: 0,
          topicHasRecentMessage: false,
        },
      }),
      config,
      5,
    );
    expect(crit.issues.find((issue) => issue.code === 'KAFKA_LAG')?.severity).toBe('crit');
    expect(crit.components.find((item) => item.key === 'kafka_consumer')?.status).toBe('critical');
  });

  it('reports Kafka unreachable without blaming the bridge', () => {
    const report = evaluateSystemHealth(
      signals({
        kafkaReachable: false,
        consumer: null,
        deviceEventMaxAt: NOW - 40 * 60_000,
        deviceLastSeenMaxAt: NOW - 40 * 60_000,
      }),
      config,
      8,
    );

    expect(codes(report)).toContain('KAFKA_UNREACHABLE');
    expect(codes(report)).not.toContain('BRIDGE_DOWN');
    expect(codes(report)).not.toContain('KAFKA_LAG');
    expect(report.components.find((item) => item.key === 'redpanda')?.status).toBe('critical');
    expect(report.issues.find((issue) => issue.code === 'KAFKA_UNREACHABLE')?.commands).toEqual([
      'docker compose ps',
      'docker compose up -d',
    ]);
  });

  it('reports MySQL down and does not invent bridge faults from unread tables', () => {
    const report = evaluateSystemHealth(
      signals({
        mysqlOk: false,
        mysqlLatencyMs: null,
        deviceEventMaxAt: null,
        deviceLastSeenMaxAt: null,
        deviceCount: 0,
      }),
      config,
      15,
    );

    expect(codes(report)).toEqual(['MYSQL_DOWN']);
    expect(report.components.find((item) => item.key === 'mysql')?.status).toBe('critical');
    expect(report.issues[0]?.commands).toContain('docker compose up -d');
  });

  it('marks a slow MySQL ping degraded and a slow probe as a degraded API', () => {
    const report = evaluateSystemHealth(
      signals({ mysqlLatencyMs: 1800 }),
      config,
      4500,
    );

    expect(report.issues).toEqual([]);
    expect(report.components.find((item) => item.key === 'mysql')?.status).toBe('degraded');
    expect(report.components.find((item) => item.key === 'api')?.status).toBe('degraded');
    expect(report.status).toBe('degraded');
  });

  it('raises API_DEMO_MOCK when the process is not in live mode', () => {
    const report = evaluateSystemHealth(signals({ demoMode: 'mock' }), config, 5);

    expect(report.status).toBe('critical');
    expect(codes(report)).toEqual(['API_DEMO_MOCK']);
    expect(report.components.find((item) => item.key === 'demo_mode')?.status).toBe('critical');
    expect(report.issues[0]?.steps.join('\n')).toContain('DEMO_MODE');
  });

  it('marks event freshness yellow before the hard stale threshold', () => {
    const report = evaluateSystemHealth(
      signals({
        deviceEventMaxAt: NOW - 10 * 60_000,
        deviceLastSeenMaxAt: NOW - 10 * 60_000,
      }),
      config,
      5,
    );

    expect(report.issues).toEqual([]);
    expect(report.status).toBe('degraded');
    expect(report.components.find((item) => item.key === 'device_event_freshness')?.status).toBe(
      'degraded',
    );
    expect(report.components.find((item) => item.key === 'bridge')?.status).toBe('degraded');
  });

  it('adds a subscription hint when live has devices but never stored an event', () => {
    const report = evaluateSystemHealth(
      signals({
        deviceEventMaxAt: null,
        deviceLastSeenMaxAt: null,
        deviceCount: 4,
        consumer: {
          state: 'Stable',
          memberCount: 1,
          lag: 0,
          highWatermark: 0,
          topicHasRecentMessage: false,
        },
      }),
      config,
      5,
    );

    expect(codes(report)).toEqual(expect.arrayContaining(['BRIDGE_DOWN', 'TUYA_SUBSCRIPTION_HINT']));
    expect(report.issues.find((issue) => issue.code === 'TUYA_SUBSCRIPTION_HINT')).toMatchObject({
      severity: 'warn',
    });
    expect(
      report.issues.find((issue) => issue.code === 'TUYA_SUBSCRIPTION_HINT')?.steps.join('\n'),
    ).toContain('PID');
  });
});

describe('readSystemHealthConfig', () => {
  it('uses the documented defaults and keeps the critical lag at least the warning lag', () => {
    expect(
      readSystemHealthConfig({
        SYSTEM_HEALTH_KAFKA_LAG_WARN: '500',
        SYSTEM_HEALTH_KAFKA_LAG_CRIT: '50',
      } as NodeJS.ProcessEnv),
    ).toMatchObject({
      staleEventMs: 900_000,
      eventWarnMs: 300_000,
      kafkaLagWarn: 500,
      kafkaLagCrit: 500,
      groupId: 'tuya-ops-demo',
      topic: 'tuya.device.events',
      brokers: ['127.0.0.1:19092'],
      demoMode: 'mock',
    });
  });
});
