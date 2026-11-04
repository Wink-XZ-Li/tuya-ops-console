export type AppProfile = 'demo' | 'production';

/** Unset or unknown profiles stay on demo. Production is explicit. */
export function readAppProfile(env: NodeJS.ProcessEnv = process.env): AppProfile {
  const raw = (env.APP_PROFILE ?? '').trim().toLowerCase();
  if (raw === 'production' || raw === 'prod') return 'production';
  return 'demo';
}

/** Warning threshold when DEVICE_SOFT_CAP is unset. Not a hard ingest stop. */
export const DEFAULT_DEVICE_SOFT_CAP = 10_000;

const NO_CAP_VALUES = new Set(['0', 'none', 'unlimited', 'off']);

/**
 * Fleet-size warning line. `null` means no cap.
 * Crossing it must not drop sync or Kafka ingest.
 */
export function readDeviceSoftCap(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.DEVICE_SOFT_CAP;
  if (raw == null || raw.trim() === '') return DEFAULT_DEVICE_SOFT_CAP;
  const text = raw.trim().toLowerCase();
  if (NO_CAP_VALUES.has(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DEVICE_SOFT_CAP;
  return Math.floor(value);
}

export function isOverDeviceSoftCap(count: number, cap: number | null): boolean {
  return cap != null && count >= cap;
}

/** Stable log line for a soft-cap signal. `action=accept` means the device is kept. */
export function deviceSoftCapLog(count: number, cap: number, extra?: string): string {
  const suffix = extra ? ` ${extra}` : '';
  return `device_soft_cap count=${count} cap=${cap} action=accept${suffix}`;
}

export function formatDeviceSoftCapWarning(
  count: number,
  env: NodeJS.ProcessEnv = process.env,
  extra?: string,
): string | null {
  const cap = readDeviceSoftCap(env);
  if (cap == null || !isOverDeviceSoftCap(count, cap)) return null;
  return deviceSoftCapLog(count, cap, extra);
}

/**
 * One reconcile-level warning. Local devices already at the cap, or a cloud
 * catalog larger than the cap, still sync in full.
 */
export function softCapReconcileWarning(
  localCount: number,
  cloudTotal: number,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const cap = readDeviceSoftCap(env);
  if (cap == null) return null;
  if (localCount >= cap || cloudTotal > cap) {
    return deviceSoftCapLog(localCount, cap, `cloudTotal=${cloudTotal}`);
  }
  return null;
}
