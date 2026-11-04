/**
 * Mock seed fixture ceiling only.
 * Sync and Kafka ingest must not import this module; fleet size is DEVICE_SOFT_CAP.
 */
export const DEFAULT_DEMO_SEED_DEVICE_CAP = 50;

export function readDemoSeedDeviceCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DEMO_SEED_DEVICE_CAP;
  if (raw == null || raw.trim() === '') return DEFAULT_DEMO_SEED_DEVICE_CAP;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DEMO_SEED_DEVICE_CAP;
  return Math.floor(value);
}
