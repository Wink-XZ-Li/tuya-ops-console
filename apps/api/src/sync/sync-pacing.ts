export const DEFAULT_SYNC_PAGE_SIZE = 20;
export const MAX_SYNC_PAGE_SIZE = 100;
export const DEFAULT_SYNC_USER_PAGE_SIZE = 100;
export const MAX_SYNC_USER_PAGE_SIZE = 100;
export const DEFAULT_SYNC_PAGE_INTERVAL_MS = 200;
export const MAX_SYNC_PAGE_INTERVAL_MS = 60_000;

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.floor(value));
}

/** Cloud device list page size. Default stays 20. */
export function readSyncPageSize(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env.SYNC_PAGE_SIZE, DEFAULT_SYNC_PAGE_SIZE, MAX_SYNC_PAGE_SIZE);
}

/** App user list page size. Default stays 100. */
export function readSyncUserPageSize(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(
    env.SYNC_USER_PAGE_SIZE,
    DEFAULT_SYNC_USER_PAGE_SIZE,
    MAX_SYNC_USER_PAGE_SIZE,
  );
}

/**
 * Pause between cloud pages. `0` or `off` disables it.
 * Default is 200ms so a 3000-device reconcile does not burst every page.
 */
export function readSyncPageIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SYNC_PAGE_INTERVAL_MS;
  if (raw == null || raw.trim() === '') return DEFAULT_SYNC_PAGE_INTERVAL_MS;
  const text = raw.trim().toLowerCase();
  if (text === '0' || text === 'off') return 0;
  return readPositiveInt(raw, DEFAULT_SYNC_PAGE_INTERVAL_MS, MAX_SYNC_PAGE_INTERVAL_MS);
}

export async function waitMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
