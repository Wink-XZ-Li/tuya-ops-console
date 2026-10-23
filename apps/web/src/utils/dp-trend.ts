export type TrendBucket = '5min' | '1h' | '1d';
export type TrendPreset = '24h' | '7d' | '30d';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TREND_BUCKET_MS: Record<TrendBucket, number> = {
  '5min': 5 * 60 * 1000,
  '1h': HOUR_MS,
  '1d': DAY_MS,
};

export const TREND_SERIES_LIMIT = 8;
export const TREND_MAX_RANGE_MS = 90 * DAY_MS;

export function bucketForRange(spanMs: number): TrendBucket {
  if (spanMs <= DAY_MS) return '5min';
  if (spanMs <= 7 * DAY_MS) return '1h';
  return '1d';
}

export function trendWindow(range: TrendPreset, now: Date): { from: string; to: string; bucket: TrendBucket } {
  const span = range === '24h' ? DAY_MS : range === '7d' ? 7 * DAY_MS : 30 * DAY_MS;
  const to = now;
  const from = new Date(to.getTime() - span);
  return { from: from.toISOString(), to: to.toISOString(), bucket: bucketForRange(span) };
}

/** Linear x inside the requested window, shared by points and fault marks. */
export function trendX(timeMs: number, fromMs: number, toMs: number, left: number, plotW: number): number {
  const span = Math.max(1, toMs - fromMs);
  return left + ((timeMs - fromMs) / span) * plotW;
}

/** Same service-parameter block the API refuses to chart. `ph` id 170, `lhd` id 171. */
const NON_TREND_DP_CODES = new Set([
  'ph',
  'lhd',
  'lhq',
  'pl',
  'dh',
  'fh',
  'fn',
  'fl',
  'fp',
  'h0',
  'h1',
  'hc',
  'id',
  'od',
]);

export function isHiddenTrendDp(dp: { code: string; name?: string | null }): boolean {
  const code = dp.code.trim().toLowerCase();
  if (NON_TREND_DP_CODES.has(code)) return true;
  const name = dp.name?.trim() ?? '';
  if (!name) return false;
  if (/^ph(?![a-z])/i.test(name) && /比例阀|电流/.test(name)) return true;
  if (/lh-?d/i.test(name) && /比例阀|电流|大气/.test(name)) return true;
  return false;
}

function storageKey(productId: string): string {
  return `ops.dpTrends.${productId}`;
}

export function readTrendSelection(productId: string): string[] | null {
  if (!productId) return null;
  try {
    const raw = localStorage.getItem(storageKey(productId));
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const codes = parsed.filter((code): code is string => typeof code === 'string' && code.length > 0);
    const visible = codes.filter((code) => !isHiddenTrendDp({ code }));
    if (visible.length === 0) return codes.length === 0 ? [] : null;
    return visible;
  } catch {
    return null;
  }
}

export function writeTrendSelection(productId: string, codes: string[]): void {
  localStorage.setItem(storageKey(productId), JSON.stringify(codes));
}
