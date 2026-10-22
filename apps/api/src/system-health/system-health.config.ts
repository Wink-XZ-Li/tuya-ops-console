import type { SystemHealthConfig } from './system-health.types';

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function readBrokers(raw: string | undefined): string[] {
  const brokers = (raw ?? '127.0.0.1:19092')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return brokers.length > 0 ? brokers : ['127.0.0.1:19092'];
}

export function readSystemHealthConfig(env: NodeJS.ProcessEnv = process.env): SystemHealthConfig {
  const staleEventMs = readPositiveInt(env.SYSTEM_HEALTH_STALE_EVENT_MS, 900_000);
  const kafkaLagWarn = readPositiveInt(env.SYSTEM_HEALTH_KAFKA_LAG_WARN, 100);
  let kafkaLagCrit = readPositiveInt(env.SYSTEM_HEALTH_KAFKA_LAG_CRIT, 1000);
  if (kafkaLagCrit < kafkaLagWarn) kafkaLagCrit = kafkaLagWarn;

  const demoMode = (env.DEMO_MODE ?? 'mock').trim().toLowerCase() || 'mock';
  const groupId = (env.KAFKA_GROUP_ID ?? 'tuya-ops-demo').trim() || 'tuya-ops-demo';
  const topic = (env.KAFKA_TOPIC_DEVICE_EVENTS ?? 'tuya.device.events').trim() || 'tuya.device.events';

  return {
    staleEventMs,
    eventWarnMs: Math.max(1, Math.floor(staleEventMs / 3)),
    kafkaLagWarn,
    kafkaLagCrit,
    mysqlSlowMs: 1000,
    apiSlowMs: 3000,
    groupId,
    brokers: readBrokers(env.KAFKA_BROKERS),
    topic,
    demoMode,
  };
}
