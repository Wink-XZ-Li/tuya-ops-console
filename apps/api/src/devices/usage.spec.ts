import { getProductDps } from './product-dp-schemas';
import { buildUsage } from './usage';
import { usageMetricsForProduct } from './usage-metrics';

describe('usage metrics from product schemas', () => {
  it('maps cumulative water, gas, and runtime codes and hides products without them', () => {
    const heater = usageMetricsForProduct('1x0qz5jtlabxywcg');
    expect(heater.map((metric) => [metric.metricId, metric.sourceDpId, metric.unit, metric.scale])).toEqual([
      ['water', 'water_total', 'G', 1],
      ['gas', 'gas_consumption', 'm³', 2],
      ['runtime', 'usage_time', 'min', 0],
    ]);
    expect(heater.every((metric) => metric.mode === 'cumulative')).toBe(true);

    const electric = usageMetricsForProduct('3gnar3yb3w4dn0ik');
    expect(electric.find((metric) => metric.metricId === 'energy')).toMatchObject({
      sourceDpId: 'power_consumption',
      name: '用电量',
    });

    expect(usageMetricsForProduct('0wyzpxylwzjx6gej')).toEqual([]);
    expect(getProductDps('0wyzpxylwzjx6gej').some((dp) => dp.code === 'steam_temp_current')).toBe(true);
  });
});

describe('buildUsage', () => {
  const from = new Date('2026-10-21T16:00:00.000Z');
  const to = new Date('2026-10-24T16:00:00.000Z');

  it('diffs a cumulative meter inside the Shanghai day and omits days without two readings', () => {
    const built = buildUsage({
      mode: 'cumulative',
      from,
      to,
      samples: [
        { t: Date.parse('2026-10-22T00:00:00.000Z'), value: 10 },
        { t: Date.parse('2026-10-22T08:00:00.000Z'), value: 18 },
        { t: Date.parse('2026-10-23T02:00:00.000Z'), value: 4 },
      ],
    });

    expect(built.days).toEqual([{ date: '2026-10-22', value: 8 }]);
    expect(built.total).toBe(8);
    expect(built.dailyAvg).toBe(8);
    expect(built.peakDay).toEqual({ date: '2026-10-22', value: 8 });
    expect(built.note).toBeNull();
    expect(built.days.some((day) => day.date === '2026-10-23' || day.value === 0)).toBe(false);
  });

  it('treats a falling meter as a reset and never returns a negative day', () => {
    const built = buildUsage({
      mode: 'cumulative',
      from,
      to,
      samples: [
        { t: Date.parse('2026-10-22T00:00:00.000Z'), value: 100 },
        { t: Date.parse('2026-10-22T04:00:00.000Z'), value: 150 },
        { t: Date.parse('2026-10-22T08:00:00.000Z'), value: 20 },
        { t: Date.parse('2026-10-22T12:00:00.000Z'), value: 40 },
      ],
    });

    expect(built.days).toEqual([{ date: '2026-10-22', value: 90 }]);
    expect(built.days.every((day) => day.value >= 0)).toBe(true);
    expect(built.note).toContain('清零');
    expect(built.note).toContain('负用量');
    expect(built.total).toBe(90);
    expect(built.dailyAvg).toBe(90);
    expect(built.peakDay).toEqual({ date: '2026-10-22', value: 90 });
  });

  it('integrates an instant rate across short gaps and skips a long miss', () => {
    const built = buildUsage({
      mode: 'instant',
      from,
      to,
      samples: [
        { t: Date.parse('2026-10-22T02:00:00.000Z'), value: 10 },
        { t: Date.parse('2026-10-22T03:00:00.000Z'), value: 30 },
        { t: Date.parse('2026-10-22T06:00:00.000Z'), value: 30 },
      ],
    });

    expect(built.days).toEqual([{ date: '2026-10-22', value: 20 }]);
    expect(built.note).toContain('缺测');
    expect(built.days.some((day) => day.value === 0)).toBe(false);
  });
});
