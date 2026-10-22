import { SYSTEM_HEALTH_CATALOG, catalogSteps } from './system-health.catalog';
import type {
  ComponentKey,
  HealthCode,
  HealthComponent,
  HealthIssue,
  HealthIssueRelated,
  HealthLevel,
  HealthReport,
  HealthSeverity,
  ProbeSignals,
  SystemHealthThresholds,
} from './system-health.types';

const LEVEL_RANK: Record<HealthLevel, number> = {
  healthy: 0,
  degraded: 1,
  critical: 2,
};

const COMPONENT_LABELS: Record<ComponentKey, string> = {
  api: 'API',
  mysql: 'MySQL',
  redpanda: 'Redpanda',
  kafka_consumer: 'Kafka 消费',
  bridge: 'Bridge',
  device_event_freshness: '事件新鲜度',
  demo_mode: '运行模式',
};

const EVENT_SINCE_CODES = new Set<HealthCode>([
  'BRIDGE_DOWN',
  'BRIDGE_STALE',
  'EVENT_GAP',
  'TUYA_SUBSCRIPTION_HINT',
]);

function worst(levels: HealthLevel[]): HealthLevel {
  return levels.reduce<HealthLevel>(
    (current, level) => (LEVEL_RANK[level] > LEVEL_RANK[current] ? level : current),
    'healthy',
  );
}

function ageMs(at: number | null, now: number): number | null {
  if (at == null || !Number.isFinite(at)) return null;
  return Math.max(0, now - at);
}

function component(key: ComponentKey, status: HealthLevel, summary: string): HealthComponent {
  return { key, label: COMPONENT_LABELS[key], status, summary };
}

function ago(age: number | null): string {
  if (age == null) return '无事件';
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return '不到 1 分钟前';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest === 0 ? `${hours} 小时前` : `${hours} 小时 ${rest} 分钟前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function relatedOf(signals: ProbeSignals): HealthIssueRelated | undefined {
  const related: HealthIssueRelated = {};
  if (signals.deviceEventMaxAt != null) {
    related.deviceEventMaxAt = new Date(signals.deviceEventMaxAt).toISOString();
  }
  if (signals.deviceLastSeenMaxAt != null) {
    related.deviceLastSeenMaxAt = new Date(signals.deviceLastSeenMaxAt).toISOString();
  }
  if (signals.consumer?.highWatermark != null) related.kafkaHw = signals.consumer.highWatermark;
  if (signals.consumer?.lag != null) related.lag = signals.consumer.lag;
  return Object.keys(related).length > 0 ? related : undefined;
}

function makeIssue(
  code: HealthCode,
  severity: HealthSeverity,
  signals: ProbeSignals,
  thresholds: SystemHealthThresholds,
): HealthIssue {
  const entry = SYSTEM_HEALTH_CATALOG[code];
  const related = relatedOf(signals);
  const issue: HealthIssue = {
    code,
    severity,
    title: entry.title,
    impact: entry.impact,
    steps: catalogSteps(code, thresholds.groupId),
    commands: [...entry.commands],
    status: 'open',
  };
  if (EVENT_SINCE_CODES.has(code) && signals.deviceEventMaxAt != null) {
    issue.since = new Date(signals.deviceEventMaxAt).toISOString();
  }
  if (related) issue.related = related;
  return issue;
}

export function evaluateSystemHealth(
  signals: ProbeSignals,
  thresholds: SystemHealthThresholds,
  durationMs: number,
): HealthReport {
  const issues: HealthIssue[] = [];
  const eventAge = ageMs(signals.deviceEventMaxAt, signals.now);
  const seenAge = ageMs(signals.deviceLastSeenMaxAt, signals.now);
  const eventsStale = eventAge == null || eventAge > thresholds.staleEventMs;
  const eventsAging =
    eventAge != null && eventAge > thresholds.eventWarnMs && eventAge <= thresholds.staleEventMs;
  const lastSeenFresh = seenAge != null && seenAge <= thresholds.staleEventMs;
  const kafkaProducing = signals.consumer?.topicHasRecentMessage === true;
  const kafkaQuiet = signals.consumer?.topicHasRecentMessage === false;

  const api = component(
    'api',
    durationMs > thresholds.apiSlowMs ? 'degraded' : 'healthy',
    durationMs > thresholds.apiSlowMs ? `探测耗时 ${durationMs} ms` : '本接口可响应',
  );

  let mysql: HealthComponent;
  if (!signals.mysqlOk) {
    mysql = component('mysql', 'critical', '连接失败');
    issues.push(makeIssue('MYSQL_DOWN', 'crit', signals, thresholds));
  } else if (
    signals.mysqlLatencyMs != null &&
    signals.mysqlLatencyMs > thresholds.mysqlSlowMs
  ) {
    mysql = component('mysql', 'degraded', `SELECT 1 偏慢（${signals.mysqlLatencyMs} ms）`);
  } else {
    mysql = component('mysql', 'healthy', 'SELECT 1 成功');
  }

  let redpanda: HealthComponent;
  if (!signals.kafkaReachable) {
    redpanda = component('redpanda', 'critical', 'broker 不可达');
    issues.push(makeIssue('KAFKA_UNREACHABLE', 'crit', signals, thresholds));
  } else {
    redpanda = component('redpanda', 'healthy', 'broker 可达');
  }

  let kafkaConsumer: HealthComponent;
  const consumer = signals.consumer;
  if (!signals.kafkaReachable || !consumer) {
    kafkaConsumer = component('kafka_consumer', 'critical', 'broker 不可达，无法检查消费组');
  } else {
    const noMembers =
      consumer.memberCount <= 0 || consumer.state === 'Empty' || consumer.state === 'Dead';
    const lag = consumer.lag;
    if (noMembers) {
      kafkaConsumer = component('kafka_consumer', 'critical', '消费组无成员');
      issues.push(makeIssue('KAFKA_LAG', 'crit', signals, thresholds));
    } else if (lag != null && lag > thresholds.kafkaLagCrit) {
      kafkaConsumer = component(
        'kafka_consumer',
        'critical',
        `lag ${lag}，超过硬阈值 ${thresholds.kafkaLagCrit}`,
      );
      issues.push(makeIssue('KAFKA_LAG', 'crit', signals, thresholds));
    } else if (lag != null && lag > thresholds.kafkaLagWarn) {
      kafkaConsumer = component(
        'kafka_consumer',
        'degraded',
        `lag ${lag}，超过软阈值 ${thresholds.kafkaLagWarn}`,
      );
      issues.push(makeIssue('KAFKA_LAG', 'warn', signals, thresholds));
    } else if (consumer.state !== 'Stable') {
      kafkaConsumer = component('kafka_consumer', 'degraded', `消费组 ${consumer.state ?? '未知'}`);
    } else if (lag == null) {
      kafkaConsumer = component('kafka_consumer', 'degraded', '无法计算 lag');
    } else {
      kafkaConsumer = component('kafka_consumer', 'healthy', `消费组 Stable，lag ${lag}`);
    }
  }

  let bridge: HealthComponent;
  let freshness: HealthComponent;
  if (!signals.mysqlOk) {
    bridge = component('bridge', 'degraded', 'MySQL 不可用，未判断 bridge');
    freshness = component('device_event_freshness', 'degraded', 'MySQL 不可用，未判断新鲜度');
  } else if (!eventsStale && !eventsAging) {
    bridge = component('bridge', 'healthy', `事件 ${ago(eventAge)}`);
    freshness = component('device_event_freshness', 'healthy', `最新事件 ${ago(eventAge)}`);
  } else if (!eventsStale && eventsAging) {
    bridge = component('bridge', 'degraded', `消息偏旧（${ago(eventAge)}）`);
    freshness = component('device_event_freshness', 'degraded', `最新事件偏旧（${ago(eventAge)}）`);
  } else if (lastSeenFresh) {
    bridge = component('bridge', 'critical', `事件停更（${ago(eventAge)}），但 Device.lastSeenAt 仍新`);
    freshness = component(
      'device_event_freshness',
      'critical',
      `事件严重过期（${ago(eventAge)}），lastSeen 仍新`,
    );
    issues.push(makeIssue('BRIDGE_STALE', 'crit', signals, thresholds));
    issues.push(makeIssue('EVENT_GAP', 'crit', signals, thresholds));
  } else if (!signals.kafkaReachable) {
    bridge = component('bridge', 'critical', '队列不可达，无法确认 bridge');
    freshness = component('device_event_freshness', 'critical', `事件严重过期（${ago(eventAge)}）`);
  } else if (kafkaProducing) {
    bridge = component('bridge', 'degraded', '队列仍有新消息，入库偏慢');
    freshness = component(
      'device_event_freshness',
      'critical',
      `事件严重过期（${ago(eventAge)}），队列里有更新的消息`,
    );
  } else {
    bridge = component('bridge', 'critical', `无法确认 bridge 存活（事件 ${ago(eventAge)}）`);
    freshness = component('device_event_freshness', 'critical', `事件严重过期（${ago(eventAge)}）`);
    issues.push(makeIssue('BRIDGE_DOWN', 'crit', signals, thresholds));
    if (
      signals.demoMode === 'live' &&
      signals.deviceCount > 0 &&
      signals.deviceEventMaxAt == null &&
      kafkaQuiet
    ) {
      issues.push(makeIssue('TUYA_SUBSCRIPTION_HINT', 'warn', signals, thresholds));
    }
  }

  let demo: HealthComponent;
  if (signals.demoMode === 'live') {
    demo = component('demo_mode', 'healthy', 'DEMO_MODE=live');
  } else {
    demo = component('demo_mode', 'critical', `DEMO_MODE=${signals.demoMode || 'mock'}`);
    issues.push(makeIssue('API_DEMO_MOCK', 'crit', signals, thresholds));
  }

  const components = [api, mysql, redpanda, kafkaConsumer, bridge, freshness, demo];
  return {
    status: worst(components.map((item) => item.status)),
    checkedAt: new Date(signals.now).toISOString(),
    durationMs,
    components,
    issues,
  };
}
