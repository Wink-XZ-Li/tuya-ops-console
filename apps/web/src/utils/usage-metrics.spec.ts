import { describe, expect, it } from 'vitest';
import { listShanghaiDates, listUsageSlots, usageMetricsForProduct } from './usage-metrics';

describe('usage metrics', () => {
  it('follows the cumulative meters and stays empty for a steam oven', () => {
    expect(
      usageMetricsForProduct('1x0qz5jtlabxywcg').map((metric) => [metric.metricId, metric.sourceDpId]),
    ).toEqual([
      ['water', 'water_total'],
      ['gas', 'gas_consumption'],
      ['runtime', 'usage_time'],
    ]);
    expect(usageMetricsForProduct('0wyzpxylwzjx6gej')).toEqual([]);
  });

  it('lists Shanghai calendar days across the requested window', () => {
    expect(listShanghaiDates('2026-10-21T16:00:00.000Z', '2026-10-23T16:00:00.000Z')).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
    const hours = listUsageSlots('2026-10-22T00:00:00.000Z', '2026-10-23T00:00:00.000Z', 'hour');
    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe('2026-10-22T08:00');
    expect(hours.at(-1)).toBe('2026-10-23T07:00');
  });
});
