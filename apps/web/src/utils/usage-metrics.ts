import { getProductDps, type ProductDp } from '../constants/product-dp-schemas';

export type UsageMetricId = 'water' | 'gas' | 'energy' | 'runtime';

export type UsageMetricConfig = {
  metricId: UsageMetricId;
  name: string;
  sourceDpId: string;
  dpId: number;
  mode: 'cumulative';
  unit: string;
  scale: number;
};

/** Keep in step with apps/api/src/devices/usage-metrics.ts. */
const USAGE_SOURCES: Array<{ metricId: UsageMetricId; name: string; codes: string[] }> = [
  {
    metricId: 'water',
    name: '用水量',
    codes: ['water_total', 'water_consumption', 'water_consumption_1', 'water_outlet'],
  },
  { metricId: 'gas', name: '用气量', codes: ['gas_consumption'] },
  {
    metricId: 'energy',
    name: '用电量',
    codes: ['power_consumption', 'power_consumption_1', 'cur_power_stats'],
  },
  {
    metricId: 'runtime',
    name: '运行时间',
    codes: ['runtime', 'usage_time', 'total_usage_time'],
  },
];

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function usageMetricsFromSchema(schema: ProductDp[]): UsageMetricConfig[] {
  const byCode = new Map(schema.filter((dp) => dp.type === 'value').map((dp) => [dp.code, dp]));
  const metrics: UsageMetricConfig[] = [];
  for (const source of USAGE_SOURCES) {
    const dp = source.codes.map((code) => byCode.get(code)).find((item) => item != null);
    if (!dp) continue;
    const values = dp.values ?? {};
    const scale = typeof values.scale === 'number' && Number.isFinite(values.scale) ? values.scale : 0;
    const unit = typeof values.unit === 'string' ? values.unit.trim() : '';
    metrics.push({
      metricId: source.metricId,
      name: source.name,
      sourceDpId: dp.code,
      dpId: dp.id,
      mode: 'cumulative',
      unit,
      scale,
    });
  }
  return metrics;
}

export function usageMetricsForProduct(productId: string): UsageMetricConfig[] {
  return usageMetricsFromSchema(getProductDps(productId));
}

export function listShanghaiDates(fromIso: string, toIso: string): string[] {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return [];
  const dates: string[] = [];
  let cursor = shanghaiDayStart(fromMs);
  const last = shanghaiDayStart(toMs);
  while (cursor <= last && dates.length < 120) {
    dates.push(formatShanghaiDate(cursor));
    cursor += DAY_MS;
  }
  return dates;
}

function shanghaiDayStart(timeMs: number): number {
  const shifted = timeMs + SHANGHAI_OFFSET_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - SHANGHAI_OFFSET_MS;
}

function formatShanghaiDate(dayStartMs: number): string {
  const shifted = new Date(dayStartMs + SHANGHAI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
