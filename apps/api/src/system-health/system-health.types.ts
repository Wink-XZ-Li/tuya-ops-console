export type HealthLevel = 'healthy' | 'degraded' | 'critical';

export type HealthSeverity = 'warn' | 'crit';

export type HealthCode =
  | 'BRIDGE_DOWN'
  | 'BRIDGE_STALE'
  | 'EVENT_GAP'
  | 'KAFKA_UNREACHABLE'
  | 'KAFKA_LAG'
  | 'MYSQL_DOWN'
  | 'API_DEMO_MOCK'
  | 'TUYA_SUBSCRIPTION_HINT';

export type ComponentKey =
  | 'api'
  | 'mysql'
  | 'redpanda'
  | 'kafka_consumer'
  | 'bridge'
  | 'device_event_freshness'
  | 'demo_mode';

export type ConsumerSnapshot = {
  state: string | null;
  memberCount: number;
  lag: number | null;
  highWatermark: number | null;
  topicHasRecentMessage: boolean | null;
};

export type ProbeSignals = {
  now: number;
  demoMode: string;
  mysqlOk: boolean;
  mysqlLatencyMs: number | null;
  kafkaReachable: boolean;
  consumer: ConsumerSnapshot | null;
  deviceEventMaxAt: number | null;
  deviceLastSeenMaxAt: number | null;
  deviceCount: number;
};

export type SystemHealthThresholds = {
  staleEventMs: number;
  eventWarnMs: number;
  kafkaLagWarn: number;
  kafkaLagCrit: number;
  mysqlSlowMs: number;
  apiSlowMs: number;
  groupId: string;
};

export type SystemHealthConfig = SystemHealthThresholds & {
  brokers: string[];
  topic: string;
  demoMode: string;
};

export type HealthIssueRelated = {
  deviceEventMaxAt?: string;
  deviceLastSeenMaxAt?: string;
  kafkaHw?: number;
  lag?: number;
};

export type HealthIssue = {
  code: HealthCode;
  severity: HealthSeverity;
  title: string;
  since?: string;
  impact: string;
  steps: string[];
  commands: string[];
  status: 'open';
  related?: HealthIssueRelated;
};

export type HealthComponent = {
  key: ComponentKey;
  label: string;
  status: HealthLevel;
  summary: string;
};

export type HealthReport = {
  status: HealthLevel;
  checkedAt: string;
  durationMs: number;
  components: HealthComponent[];
  issues: HealthIssue[];
};
