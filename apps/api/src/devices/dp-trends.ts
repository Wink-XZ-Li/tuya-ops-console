/** Property messages the bridge already stores on DeviceEvent. */
export const TREND_PROPERTY_BIZ_CODES = [
  'devicePropertyMessage',
  'property',
  'devicePropertyChange',
] as const;

export const TREND_BUCKETS = {
  '5min': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
} as const;

export type TrendBucket = keyof typeof TREND_BUCKETS;

export const TREND_MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
export const TREND_TOP_COUNT = 3;
export const TREND_SERIES_LIMIT = 8;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type TrendDpSchema = {
  id: number;
  code: string;
  name: string;
  type: string;
  values?: Record<string, unknown> | null;
};

export type DpSample = { code: string; t: number; value: number };

export type TrendPoint = { t: string; avg: number; min: number; max: number };

export type TrendSeries = {
  dpId: string;
  name: string;
  unit: string | null;
  points: TrendPoint[];
};

export function bucketForRange(spanMs: number): TrendBucket {
  if (spanMs <= DAY_MS) return '5min';
  if (spanMs <= 7 * DAY_MS) return '1h';
  return '1d';
}

export function bucketStartMs(timeMs: number, bucket: TrendBucket): number {
  const size = TREND_BUCKETS[bucket];
  if (bucket === '1d') {
    const shifted = timeMs + SHANGHAI_OFFSET_MS;
    return Math.floor(shifted / size) * size - SHANGHAI_OFFSET_MS;
  }
  return Math.floor(timeMs / size) * size;
}

export function applyDpScale(value: number, scale: number | null | undefined): number {
  if (scale == null || !Number.isFinite(scale) || scale <= 0) return value;
  return value / 10 ** scale;
}

export function asDpNumber(value: unknown): number | null {
  if (typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || !/^[-+]?\d+(\.\d+)?$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asEpochMs(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed < 1e12 ? parsed * 1000 : parsed;
  }
  return fallback;
}

type RawRow = { code: string; value: unknown; time?: unknown };

function pushRows(items: unknown, into: RawRow[]) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { code?: unknown; dpId?: unknown; value?: unknown; time?: unknown };
    const code =
      typeof row.code === 'string' && row.code.trim()
        ? row.code.trim()
        : row.dpId != null && String(row.dpId).trim()
          ? String(row.dpId).trim()
          : '';
    if (!code) continue;
    into.push({ code, value: row.value, time: row.time });
  }
}

function rowsFromPayload(payload: unknown, depth = 0): RawRow[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || depth > 2) return [];
  const root = payload as Record<string, unknown>;
  const fromStatus: RawRow[] = [];
  pushRows(root.status, fromStatus);
  if (fromStatus.length > 0) return fromStatus;

  const fromProperties: RawRow[] = [];
  pushRows(root.properties, fromProperties);
  if (fromProperties.length > 0) return fromProperties;

  if (root.properties && typeof root.properties === 'object' && !Array.isArray(root.properties)) {
    for (const [code, value] of Object.entries(root.properties as Record<string, unknown>)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
        const row = value as { value?: unknown; time?: unknown };
        fromProperties.push({ code, value: row.value, time: row.time });
      } else {
        fromProperties.push({ code, value });
      }
    }
    if (fromProperties.length > 0) return fromProperties;
  }

  if (root.data && typeof root.data === 'object') return rowsFromPayload(root.data, depth + 1);
  return [];
}

export function extractDpSamples(payload: unknown, eventTime: Date): DpSample[] {
  const fallback = eventTime.getTime();
  const samples: DpSample[] = [];
  for (const row of rowsFromPayload(payload)) {
    const value = asDpNumber(row.value);
    if (value == null) continue;
    samples.push({ code: row.code, t: asEpochMs(row.time, fallback), value });
  }
  return samples;
}

export function isTrendValueDp(type: string): boolean {
  return type === 'value';
}

/**
 * Installer calibration points, not operating trends.
 * Confirmed in PRODUCT_DP_SCHEMAS.json: `ph` id 170「PH采暖最大比例阀电流」,
 * `lhd` id 171「LH-D（大气式）卫浴最大比例阀电流」, and the same service block.
 */
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

export function resolveDpToken(token: string, schema: TrendDpSchema[]): string {
  const trimmed = token.trim();
  if (!trimmed) return '';
  const byId = schema.find((dp) => String(dp.id) === trimmed);
  return byId?.code ?? trimmed;
}

export function needsReportCounts(
  requested: string[],
  defaults: string[],
  numericCodes: ReadonlySet<string> | null,
): boolean {
  if (requested.length > 0) return false;
  const usable = defaults.filter((code) => numericCodes == null || numericCodes.has(code));
  return usable.length === 0;
}

export function chooseTrendCodes(options: {
  requested: string[];
  defaults: string[];
  counts: Map<string, number>;
  numericCodes: ReadonlySet<string> | null;
}): string[] {
  const allow = (code: string) =>
    Boolean(code) &&
    !isHiddenTrendDp({ code }) &&
    (options.numericCodes == null || options.numericCodes.has(code));
  if (options.requested.length > 0) {
    return [...new Set(options.requested.filter(allow))].slice(0, TREND_SERIES_LIMIT);
  }
  const defaults = [...new Set(options.defaults.filter(allow))];
  if (defaults.length > 0) return defaults.slice(0, TREND_SERIES_LIMIT);
  return [...options.counts.entries()]
    .filter(([code, count]) => count > 0 && allow(code))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TREND_TOP_COUNT)
    .map(([code]) => code);
}

function schemaScale(values: Record<string, unknown> | null | undefined): number {
  const scale = values?.scale;
  return typeof scale === 'number' && Number.isFinite(scale) ? scale : 0;
}

function schemaUnit(values: Record<string, unknown> | null | undefined): string | null {
  const unit = values?.unit;
  return typeof unit === 'string' && unit.trim() ? unit.trim() : null;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function aggregateDpSeries(
  samples: DpSample[],
  codes: string[],
  fromMs: number,
  toMs: number,
  bucket: TrendBucket,
): Array<{ dpId: string; points: TrendPoint[] }> {
  const wanted = new Set(codes);
  const buckets = new Map<string, Map<number, { sum: number; count: number; min: number; max: number }>>();
  for (const code of codes) buckets.set(code, new Map());

  for (const sample of samples) {
    if (!wanted.has(sample.code) || sample.t < fromMs || sample.t > toMs) continue;
    const start = bucketStartMs(sample.t, bucket);
    const byCode = buckets.get(sample.code);
    if (!byCode) continue;
    const acc = byCode.get(start);
    if (!acc) {
      byCode.set(start, { sum: sample.value, count: 1, min: sample.value, max: sample.value });
    } else {
      acc.sum += sample.value;
      acc.count += 1;
      acc.min = Math.min(acc.min, sample.value);
      acc.max = Math.max(acc.max, sample.value);
    }
  }

  return codes.map((code) => {
    const points = [...(buckets.get(code)?.entries() ?? [])]
      .sort((a, b) => a[0] - b[0])
      .map(([start, acc]) => ({
        t: new Date(start).toISOString(),
        avg: roundMetric(acc.sum / acc.count),
        min: roundMetric(acc.min),
        max: roundMetric(acc.max),
      }));
    return { dpId: code, points };
  });
}

export function buildDpTrends(input: {
  events: Array<{ payload: unknown; eventTime: Date }>;
  schema: TrendDpSchema[];
  defaults: string[];
  requested: string[];
  from: Date;
  to: Date;
  bucket: TrendBucket;
}): TrendSeries[] {
  const schema = input.schema;
  const numericList = schema.filter((dp) => isTrendValueDp(dp.type) && !isHiddenTrendDp(dp));
  const numericCodes = schema.length > 0 ? new Set(numericList.map((dp) => dp.code)) : null;
  const meta = new Map(numericList.map((dp) => [dp.code, dp]));
  const requested = input.requested
    .map((token) => resolveDpToken(token, schema))
    .filter(Boolean);
  const defaults = input.defaults.map((token) => resolveDpToken(token, schema)).filter(Boolean);

  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const countFrom = toMs - 7 * DAY_MS;
  const counts = new Map<string, number>();
  const samples: DpSample[] = [];

  for (const event of input.events) {
    for (const raw of extractDpSamples(event.payload, event.eventTime)) {
      const code = resolveDpToken(raw.code, schema);
      if (isHiddenTrendDp({ code, name: meta.get(code)?.name })) continue;
      if (numericCodes && !numericCodes.has(code)) continue;
      const value = applyDpScale(raw.value, schemaScale(meta.get(code)?.values));
      if (raw.t >= countFrom && raw.t <= toMs) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      if (raw.t >= fromMs && raw.t <= toMs) {
        samples.push({ code, t: raw.t, value });
      }
    }
  }

  const codes = chooseTrendCodes({ requested, defaults, counts, numericCodes });
  return aggregateDpSeries(samples, codes, fromMs, toMs, input.bucket).map((series) => {
    const dp = meta.get(series.dpId);
    const unit = schemaUnit(dp?.values);
    return {
      dpId: series.dpId,
      name: dp?.name || series.dpId,
      unit,
      points: series.points,
    };
  });
}

export function trendCountWindow(from: Date, to: Date, count: boolean): Date {
  if (!count) return from;
  const week = new Date(to.getTime() - 7 * DAY_MS);
  return week.getTime() < from.getTime() ? week : from;
}

export { DAY_MS, HOUR_MS };
