import { getProductDps } from './product-dp-schemas';
import {
  DEVICE_6cacc0e565a69e000flgna as DEVICE1,
  DEVICE_6cd64f1804551a53b01wkg as DEVICE2,
  SNAPSHOT_FROM,
  SNAPSHOT_TO,
  type SnapshotPoint,
} from './usage-snapshot.fixture';
import { buildUsage, type UsageBucket, type UsageSample } from './usage';
import { usageMetricsForProduct } from './usage-metrics';

/** 2026-11-10 10:24 快照的 24h 查询窗。文件本身从这一刻开始，里面没有更早的事件。 */
const WINDOW_FROM = new Date(SNAPSHOT_FROM);
const WINDOW_TO = new Date(SNAPSHOT_TO);

function scaled(points: SnapshotPoint[], scale: number): UsageSample[] {
  const factor = 10 ** scale;
  return points.map((point) => ({ t: point.t, value: point.raw / factor }));
}

function at(iso: string, value: number): UsageSample {
  return { t: Date.parse(iso), value };
}

function collect(
  samples: UsageSample[],
  baseline: UsageSample | null,
  bucket: UsageBucket = 'hour',
  from = WINDOW_FROM,
  to = WINDOW_TO,
) {
  return buildUsage({
    mode: 'cumulative',
    bucket,
    from,
    to,
    samples,
    baseline,
  });
}

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

  it('reads the boiler PID as scaled cycle meters, not invented runtime', () => {
    const boiler = usageMetricsForProduct('ckjfqtnqqystvfaa');
    expect(boiler.map((metric) => [metric.metricId, metric.sourceDpId, metric.unit, metric.scale])).toEqual([
      ['water', 'water_consumption', 'L', 1],
      ['gas', 'gas_consumption', 'm³', 1],
      ['runtime', 'runtime', '分钟', 0],
    ]);
  });
});

describe('buildUsage', () => {
  const from = new Date('2026-10-21T16:00:00.000Z');
  const to = new Date('2026-10-24T16:00:00.000Z');

  it('counts a cross-day reset as the new reading and keeps the day total equal to the hours', () => {
    const samples = [
      { t: Date.parse('2026-10-22T00:00:00.000Z'), value: 10 },
      { t: Date.parse('2026-10-22T08:00:00.000Z'), value: 18 },
      { t: Date.parse('2026-10-23T02:00:00.000Z'), value: 4 },
    ];
    const built = buildUsage({ mode: 'cumulative', from, to, samples });
    const hourly = buildUsage({ mode: 'cumulative', bucket: 'hour', from, to, samples });

    expect(built.days).toEqual([
      { date: '2026-10-22', value: 8 },
      { date: '2026-10-23', value: 4 },
    ]);
    expect(built.total).toBe(12);
    expect(hourly.total).toBe(built.total);
    expect(built.days.every((day) => day.value < 18)).toBe(true);
    expect(built.note).toContain('清零');
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

  it('puts a 24-hour cumulative window on Shanghai hours and skips empty hours', () => {
    const built = buildUsage({
      mode: 'cumulative',
      bucket: 'hour',
      from: new Date('2026-10-22T00:00:00.000Z'),
      to: new Date('2026-10-23T00:00:00.000Z'),
      samples: [
        { t: Date.parse('2026-10-22T01:00:00.000Z'), value: 10 },
        { t: Date.parse('2026-10-22T02:00:00.000Z'), value: 14 },
        { t: Date.parse('2026-10-22T05:00:00.000Z'), value: 20 },
      ],
    });

    expect(built.bucket).toBe('hour');
    expect(built.days).toEqual([
      { date: '2026-10-22T10:00', value: 4 },
      { date: '2026-10-22T13:00', value: 6 },
    ]);
    expect(built.total).toBe(10);
    expect(built.dailyAvg).toBe(5);
    expect(built.days.every((day) => day.value >= 0)).toBe(true);
  });

  const device1Gas = scaled(DEVICE1.gas, 1);
  const device1Runtime = scaled(DEVICE1.runtime, 0);
  const device1Water = scaled(DEVICE1.water, 1);
  /** Stored reset inside the extract: raw 0 one second after the 12:00 raw 2. Not a pre-window guess. */
  const device1GasReset = DEVICE1.gas[1];

  it('matches hour and day totals on the extracted series and does not show the unresolved opening as 0', () => {
    for (const samples of [device1Gas, device1Runtime, device1Water, scaled(DEVICE2.gas, 1), scaled(DEVICE2.runtime, 0), scaled(DEVICE2.water, 1)]) {
      const hour = collect(samples, null, 'hour');
      const day = collect(samples, null, 'day');
      expect(day.total).toBe(hour.total);
      expect(hour.days.some((bucket) => bucket.value === 0)).toBe(false);
      expect(day.days.some((bucket) => bucket.value === 0)).toBe(false);
    }
    const gas = collect(device1Gas, null, 'hour');
    expect(gas.days).toEqual([
      { date: '2026-11-09T20:00', value: 0.1 },
      { date: '2026-11-10T00:00', value: 0.1 },
      { date: '2026-11-10T07:00', value: 0.1 },
      { date: '2026-11-10T09:00', value: 0.1 },
    ]);
    expect(gas.total).toBe(0.4);
    expect(gas.note).toContain('没有把它记成 0');
    expect(collect(device1Water, null, 'hour').days.find((bucket) => bucket.date === '2026-11-09T11:00')?.value).toBe(0.8);
    expect(collect(device1Runtime, null, 'day').days).toEqual([{ date: '2026-11-10', value: 4 }]);
  });

  it('uses the stored 12:00 reset as the anchor for the later pulses, including the next calendar day', () => {
    expect(device1GasReset.raw).toBe(0);
    const anchor = { t: device1GasReset.t, value: 0 };
    const later = device1Gas.filter((sample) => sample.t > anchor.t);
    const from = new Date(anchor.t + 1);
    const hour = collect(later, anchor, 'hour', from, WINDOW_TO);
    const day = collect(later, anchor, 'day', from, WINDOW_TO);
    expect(hour.days.map((bucket) => bucket.date)).toEqual([
      '2026-11-09T20:00',
      '2026-11-10T00:00',
      '2026-11-10T07:00',
      '2026-11-10T09:00',
    ]);
    expect(hour.days.every((bucket) => bucket.value === 0.1)).toBe(true);
    expect(day.total).toBe(hour.total);
    expect(day.days.find((bucket) => bucket.date === '2026-11-10')?.value).toBe(0.3);

    const covering = device1Gas.filter((sample) => sample.t >= anchor.t);
    const coveredHour = collect(covering, null, 'hour', new Date(anchor.t), WINDOW_TO);
    const coveredDay = collect(covering, null, 'day', new Date(anchor.t), WINDOW_TO);
    for (const date of ['2026-11-10T00:00', '2026-11-10T07:00', '2026-11-10T09:00']) {
      expect(coveredHour.days.find((bucket) => bucket.date === date)?.value).toBe(
        hour.days.find((bucket) => bucket.date === date)?.value,
      );
    }
    expect(coveredDay.days.find((bucket) => bucket.date === '2026-11-10')?.value).toBe(0.3);
    expect(coveredHour.total).toBe(coveredDay.total);
  });

  it('keeps a constructed zero anchor distinct from the snapshot and does not add a lifetime total', () => {
    const pulse = [at('2026-11-10T07:30:09.757+08:00', 0.1), at('2026-11-10T07:30:10.757+08:00', 0)];
    const constructed = collect(pulse, at('2026-11-10T07:00:00+08:00', 0));
    expect(constructed.days).toEqual([{ date: '2026-11-10T07:00', value: 0.1 }]);
    const unresolved = collect(pulse, null);
    expect(unresolved.days).toEqual([]);
    expect(unresolved.note).toContain('没有把它记成 0');

    const from = new Date('2026-10-21T16:00:00.000Z');
    const to = new Date('2026-10-24T16:00:00.000Z');
    const samples = [
      at('2026-10-22T00:00:00.000Z', 1000),
      at('2026-10-22T06:00:00.000Z', 1010),
      at('2026-10-23T00:00:00.000Z', 1020),
      at('2026-10-23T06:00:00.000Z', 1030),
    ];
    const hour = collect(samples, null, 'hour', from, to);
    const day = collect(samples, null, 'day', from, to);
    expect(hour.total).toBe(30);
    expect(day.total).toBe(hour.total);
    expect(day.days).toEqual([
      { date: '2026-10-22', value: 10 },
      { date: '2026-10-23', value: 20 },
    ]);
    const anchored = collect(samples.slice(1), at('2026-10-21T12:00:00.000Z', 1000), 'day', from, to);
    expect(anchored.total).toBe(30);
    expect(anchored.days.every((bucket) => bucket.value < 100)).toBe(true);

    const dust = [
      at('2026-10-22T01:00:00.000Z', 0),
      at('2026-10-22T02:00:00.000Z', 0.0004),
      at('2026-10-22T03:00:00.000Z', 0.0008),
    ];
    const dustHour = collect(dust, null, 'hour', from, to);
    const dustDay = collect(dust, null, 'day', from, to);
    expect(dustHour.total).toBe(0.001);
    expect(dustDay.total).toBe(dustHour.total);
    expect(dustHour.days.some((bucket) => bucket.value === 0)).toBe(false);

    const dipped = collect(
      [at('2026-10-22T02:00:00.000Z', 999), at('2026-10-22T06:00:00.000Z', 1005)],
      at('2026-10-21T12:00:00.000Z', 1000),
      'hour',
      from,
      to,
    );
    expect(dipped.total).toBe(6);
    expect(dipped.note).toContain('历史总量');
    expect(collect([at('2026-10-22T02:00:00.000Z', 2)], null, 'hour', from, to).note).toContain('没有把它记成 0');
  });

  it('attributes a step across midnight to the later Shanghai hour, not the anchor day', () => {
    const built = collect(
      [at('2026-11-10T00:10:00+08:00', 3), at('2026-11-10T00:10:01+08:00', 0)],
      at('2026-11-09T23:50:00+08:00', 0),
    );
    expect(built.days).toEqual([{ date: '2026-11-10T00:00', value: 3 }]);
  });

  it('does not open a zero hour when the anchor and the first reading match', () => {
    const from = new Date('2026-10-22T00:00:00.000Z');
    const to = new Date('2026-10-23T00:00:00.000Z');
    const built = collect(
      [at('2026-10-22T02:00:00.000Z', 10), at('2026-10-22T03:00:00.000Z', 18)],
      at('2026-10-22T01:00:00.000Z', 10),
      'hour',
      from,
      to,
    );
    expect(built.days).toEqual([{ date: '2026-10-22T11:00', value: 8 }]);
  });

  it('uses the window anchor on the first day bucket without adding a lifetime opening', () => {
    const from = new Date('2026-10-21T16:00:00.000Z');
    const to = new Date('2026-10-24T16:00:00.000Z');
    const built = collect(
      [at('2026-10-22T00:00:00.000Z', 1005), at('2026-10-22T08:00:00.000Z', 1010)],
      at('2026-10-21T12:00:00.000Z', 1000),
      'day',
      from,
      to,
    );
    expect(built.days).toEqual([{ date: '2026-10-22', value: 10 }]);
    expect(collect(
      [at('2026-10-22T00:00:00.000Z', 1005), at('2026-10-22T08:00:00.000Z', 1010)],
      at('2026-10-21T12:00:00.000Z', 1000),
      'hour',
      from,
      to,
    ).total).toBe(built.total);
  });

  it('does not turn a cumulative anchor into an instant rate', () => {
    const from = new Date('2026-10-21T16:00:00.000Z');
    const to = new Date('2026-10-24T16:00:00.000Z');
    const built = buildUsage({
      mode: 'instant',
      from,
      to,
      baseline: at('2026-10-21T00:00:00.000Z', 1000),
      samples: [
        at('2026-10-22T02:00:00.000Z', 10),
        at('2026-10-22T03:00:00.000Z', 30),
        at('2026-10-22T06:00:00.000Z', 30),
      ],
    });
    expect(built.days).toEqual([{ date: '2026-10-22', value: 20 }]);
  });
});
