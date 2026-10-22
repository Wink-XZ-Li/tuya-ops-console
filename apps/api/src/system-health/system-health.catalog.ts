import type { HealthCode, HealthSeverity } from './system-health.types';

export type CatalogEntry = {
  title: string;
  impact: string;
  severity: HealthSeverity;
  steps: readonly string[];
  commands: readonly string[];
};

export const SYSTEM_HEALTH_CATALOG: Record<HealthCode, CatalogEntry> = {
  BRIDGE_DOWN: {
    title: 'Bridge 未在写入',
    impact: '设备日志和实时故障告警停止入库',
    severity: 'crit',
    steps: [
      '在仓库根目录执行 pnpm dev:bridge',
      '确认日志里有 Tuya MQ WebSocket open 与 Forwarded',
      '刷新本页',
    ],
    commands: ['pnpm dev:bridge'],
  },
  BRIDGE_STALE: {
    title: 'Bridge 假活',
    impact: '连接还在，但已经不再把设备事件写进队列',
    severity: 'crit',
    steps: [
      '在运行 bridge 的终端按 Ctrl+C，停掉假活进程',
      '在仓库根目录执行 pnpm dev:bridge（建议 pnpm dev:bridge 2>&1 | tee -a logs/bridge.log）',
      '确认 Kafka 高水位和本页事件新鲜度恢复',
      '建议合入 bridge 的 pong / 看门狗，避免 TCP 还在但不 produce',
    ],
    commands: ['pnpm dev:bridge 2>&1 | tee -a logs/bridge.log'],
  },
  EVENT_GAP: {
    title: '事件停更但设备仍像在线',
    impact: '设备同步或状态刷新仍可能更新 lastSeen，事件路径已经断开。勿只靠同步',
    severity: 'crit',
    steps: [
      '勿只点「同步设备」或刷新设备状态，那不会恢复事件入库',
      '按 bridge 故障处理：停掉旧进程后，在仓库根目录执行 pnpm dev:bridge',
      '确认日志出现 Tuya MQ WebSocket open 与 Forwarded，再刷新本页',
    ],
    commands: ['pnpm dev:bridge'],
  },
  KAFKA_UNREACHABLE: {
    title: 'Redpanda / Kafka 不可达',
    impact: '整条消息队列链路中断，事件无法入库',
    severity: 'crit',
    steps: [
      '在仓库根目录执行 docker compose ps，确认 redpanda 容器在运行',
      '若未启动，执行 docker compose up -d',
      '确认 KAFKA_BROKERS（默认 127.0.0.1:19092）可连接后刷新本页',
    ],
    commands: ['docker compose ps', 'docker compose up -d'],
  },
  KAFKA_LAG: {
    title: 'Kafka 消费延迟',
    impact: '事件已经进入队列，但入库延迟',
    severity: 'warn',
    steps: [
      '查看 API 日志里的 KafkaConsumer',
      '确认消费组 {groupId} 有成员且状态为 Stable',
      '延迟持续升高时，在运行 API 的终端重启该进程。本页没有重启按钮',
    ],
    commands: [],
  },
  MYSQL_DOWN: {
    title: 'MySQL 连接失败',
    impact: '运维台后台不可用，列表和事件都读不出来',
    severity: 'crit',
    steps: [
      '在仓库根目录执行 docker compose ps，确认 mysql 容器在运行',
      '若未启动，执行 docker compose up -d',
      '确认 DATABASE_URL 指向本机 3306 后刷新本页',
    ],
    commands: ['docker compose ps', 'docker compose up -d'],
  },
  API_DEMO_MOCK: {
    title: '当前为 mock 模式',
    impact: '没有接真实涂鸦消息队列，看不到线上设备事件',
    severity: 'crit',
    steps: [
      '把 .env 里的 DEMO_MODE 和 VITE_DEMO_MODE 改成 live',
      '填写 TUYA_ACCESS_ID 与 TUYA_ACCESS_SECRET',
      '重启 API 与 bridge 后再刷新本页。本页没有重启按钮',
    ],
    commands: [],
  },
  TUYA_SUBSCRIPTION_HINT: {
    title: '涂鸦云订阅可能未勾选产品',
    impact: '链路在，但还没有任何设备事件入库',
    severity: 'warn',
    steps: [
      '打开涂鸦云开发控制台的消息订阅规则',
      '勾选需要监测的产品 PID',
      '保存后等待新事件，再刷新本页',
    ],
    commands: [],
  },
};

export const HEALTH_CODE_ORDER: readonly HealthCode[] = [
  'MYSQL_DOWN',
  'KAFKA_UNREACHABLE',
  'KAFKA_LAG',
  'BRIDGE_DOWN',
  'BRIDGE_STALE',
  'EVENT_GAP',
  'TUYA_SUBSCRIPTION_HINT',
  'API_DEMO_MOCK',
];

export function catalogSteps(code: HealthCode, groupId: string): string[] {
  return SYSTEM_HEALTH_CATALOG[code].steps.map((step) => step.replaceAll('{groupId}', groupId));
}

export function listSystemHealthCatalog(groupId = 'tuya-ops-demo') {
  return HEALTH_CODE_ORDER.map((code) => {
    const entry = SYSTEM_HEALTH_CATALOG[code];
    return {
      code,
      title: entry.title,
      impact: entry.impact,
      severity: entry.severity,
      steps: catalogSteps(code, groupId),
      commands: [...entry.commands],
    };
  });
}
