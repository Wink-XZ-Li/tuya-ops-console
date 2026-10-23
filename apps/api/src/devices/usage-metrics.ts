import { getProductDps, type ProductDp } from './product-dp-schemas';

export type UsageMetricId = 'water' | 'gas' | 'energy' | 'runtime';

export type UsageMetricConfig = {
  metricId: UsageMetricId;
  name: string;
  /** DP code stored on property events. Numeric ids are resolved before matching. */
  sourceDpId: string;
  dpId: number;
  mode: 'cumulative';
  unit: string;
  scale: number;
};

/**
 * Cumulative meters already kept out of P1 trends.
 * First matching value DP wins. Products with none of these codes get no 用量 block.
 */
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

export function usageMetricsFromSchema(schema: ProductDp[]): UsageMetricConfig[] {
  const byCode = new Map(
    schema.filter((dp) => dp.type === 'value').map((dp) => [dp.code, dp]),
  );
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
