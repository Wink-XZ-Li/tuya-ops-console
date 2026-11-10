/**
 * Detail charts: a window of 24h or less may read DeviceEvent rows.
 * Longer windows keep at most LONG_WINDOW_MAX_POINTS samples (D6).
 * Retention moves rows older than EVENT_HOT_DAYS into DeviceEventArchive.
 */

export const SHORT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const LONG_WINDOW_MAX_POINTS = 288;
/** Page size for a long-window scan. Never a single take of 4000 or 8000. */
export const EVENT_PAGE_SIZE = 400;
/** Prior-state probe before `from`. Stops early once every status DP is filled. */
export const LOOKBACK_PAGE_SIZE = 200;
export const LOOKBACK_MAX_PAGES = 5;
/**
 * Usage meters are reported far less often than status. Walk backward only
 * until that DP appears. 30 pages is 6000 events, a few days at the observed
 * property rate, and stops a missing DP from scanning the whole hot table.
 * Hitting the cap is reported as an unconfirmed anchor. It is not a stored zero.
 */
export const USAGE_BASELINE_MAX_PAGES = 30;

const MIN_BUCKET_MS = 60 * 1000;

export function isShortEventWindow(from: Date, to: Date): boolean {
  const span = to.getTime() - from.getTime();
  return Number.isFinite(span) && span >= 0 && span <= SHORT_WINDOW_MS;
}

/** Bucket width so a long window yields at most `maxPoints` samples. */
export function longWindowBucketMs(from: Date, to: Date, maxPoints = LONG_WINDOW_MAX_POINTS): number {
  const span = Math.max(1, to.getTime() - from.getTime());
  const points = Math.max(1, maxPoints);
  return Math.max(MIN_BUCKET_MS, Math.ceil(span / points));
}

export function eventHotDays(): number {
  const parsed = Number(process.env.EVENT_HOT_DAYS ?? 14);
  if (!Number.isFinite(parsed) || parsed < 1) return 14;
  return Math.min(90, Math.floor(parsed));
}

export function eventHotCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - eventHotDays());
  return cutoff;
}

export type TimedRow = { id?: string; eventTime: Date };

export function compareEvents(a: TimedRow, b: TimedRow): number {
  const delta = a.eventTime.getTime() - b.eventTime.getTime();
  if (delta !== 0) return delta;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

export type EventPageQuery = {
  where: unknown;
  orderBy: Array<{ eventTime: 'asc' | 'desc' } | { id: 'asc' | 'desc' }>;
  take: number;
  select: Record<string, boolean>;
};

/**
 * Walk [from, to] in pages of EVENT_PAGE_SIZE. Callers fold each page and drop it.
 * A short page ends the walk, so the caller never issues one take of the whole window.
 */
export async function forEachEventPage<T extends TimedRow>(
  findMany: (query: EventPageQuery) => Promise<T[]>,
  where: unknown,
  select: Record<string, boolean>,
  onPage: (page: T[]) => void,
  pageSize = EVENT_PAGE_SIZE,
): Promise<void> {
  let cursor: { eventTime: Date; id: string } | null = null;
  for (;;) {
    const wherePage = cursor
      ? {
          AND: [
            where,
            {
              OR: [
                { eventTime: { gt: cursor.eventTime } },
                { AND: [{ eventTime: cursor.eventTime }, { id: { gt: cursor.id } }] },
              ],
            },
          ],
        }
      : where;
    const page = await findMany({
      where: wherePage,
      orderBy: [{ eventTime: 'asc' }, { id: 'asc' }],
      take: pageSize,
      select,
    });
    if (page.length === 0) return;
    onPage(page);
    if (page.length < pageSize) return;
    const last = page[page.length - 1];
    if (!last?.id || !(last.eventTime instanceof Date)) return;
    if (cursor && cursor.id === last.id && cursor.eventTime.getTime() === last.eventTime.getTime()) {
      return;
    }
    cursor = { eventTime: last.eventTime, id: last.id };
  }
}

export function bucketKey(timeMs: number, fromMs: number, bucketMs: number): number {
  return Math.floor((timeMs - fromMs) / bucketMs);
}

/** Last sample in each bucket. Result length is at most the number of occupied buckets. */
export function downsampleLastPerBucket<T extends { t: number }>(
  points: T[],
  fromMs: number,
  bucketMs: number,
): T[] {
  const byBucket = new Map<number, T>();
  for (const point of points) {
    const key = bucketKey(point.t, fromMs, bucketMs);
    const prev = byBucket.get(key);
    if (!prev || point.t >= prev.t) byBucket.set(key, point);
  }
  return [...byBucket.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => point);
}
