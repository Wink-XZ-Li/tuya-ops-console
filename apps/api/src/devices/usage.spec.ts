import { getProductDps } from './product-dp-schemas';
import { buildUsage, type UsageBucket, type UsageSample } from './usage';
import { usageMetricsForProduct } from './usage-metrics';

/** 2026-11-10 10:24 快照里的 24h 查询窗，不是实时生产数据。 */
const WINDOW_FROM = new Date('2026-11-09T10:24:00+08:00');
const WINDOW_TO = new Date('2026-11-10T10:24:00+08:00');
/** 7 天逐小时能找回首笔，是因为窗前最后读数是清零后的 0，不是因为把首值本身加进去。 */
const PRIOR_RESET = { t: Date.parse('2026-11-09T07:30:00+08:00'), value: 0 };

function scaled(raw: Array<[string, number]>, scale: number): UsageSample[] {
  const factor = 10 ** scale;
  return raw.map(([iso, value]) => ({ t: Date.parse(iso), value: value / factor }));
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

  const device1Gas = scaled(
    [
      ['2026-11-09T12:00:25.444+08:00', 2],
      ['2026-11-09T12:00:26.447+08:00', 0],
      ['2026-11-09T20:29:53.176+08:00', 1],
      ['2026-11-09T20:29:54.156+08:00', 0],
      ['2026-11-10T00:30:23.093+08:00', 1],
      ['2026-11-10T00:30:24.089+08:00', 0],
      ['2026-11-10T07:29:52.131+08:00', 1],
      ['2026-11-10T07:29:53.133+08:00', 0],
      ['2026-11-10T09:59:51.935+08:00', 1],
      ['2026-11-10T09:59:52.937+08:00', 0],
    ],
    1,
  );
  const device1Runtime = scaled(
    [
      ['2026-11-09T12:00:25.452+08:00', 6],
      ['2026-11-09T12:00:26.467+08:00', 0],
      ['2026-11-10T00:30:23.099+08:00', 3],
      ['2026-11-10T00:30:24.095+08:00', 0],
      ['2026-11-10T07:29:52.138+08:00', 1],
      ['2026-11-10T07:29:53.140+08:00', 0],
    ],
    0,
  );
  const device1Water = scaled(
    [
      ['2026-11-09T11:29:54.347+08:00', 90],
      ['2026-11-09T11:29:55.363+08:00', 0],
      ['2026-11-09T11:30:45.734+08:00', 2],
      ['2026-11-09T11:30:47.834+08:00', 0],
      ['2026-11-09T11:30:48.837+08:00', 2],
      ['2026-11-09T11:30:50.850+08:00', 4],
      ['2026-11-09T11:30:51.895+08:00', 2],
      ['2026-11-09T12:00:25.447+08:00', 1158],
      ['2026-11-09T12:00:26.451+08:00', 0],
      ['2026-11-09T12:59:54.080+08:00', 84],
      ['2026-11-09T12:59:55.082+08:00', 0],
    ],
    1,
  );

  it('keeps a leading cycle total uncounted when no reading exists before the window', () => {
    const gas = collect(device1Gas, null);
    expect(gas.days.find((day) => day.date === '2026-11-09T12:00')?.value).toBe(0);
    expect(gas.total).toBe(0.4);
    const runtime = collect(device1Runtime, null);
    expect(runtime.days.find((day) => day.date === '2026-11-09T12:00')?.value).toBe(0);
    expect(runtime.total).toBe(4);
    expect(collect(device1Water, null).days.find((day) => day.date === '2026-11-09T11:00')?.value).toBe(0.8);
  });

  it('counts the same complete hours once a pre-window reset is the anchor', () => {
    const gas = collect(device1Gas, PRIOR_RESET);
    expect(gas.days).toEqual([
      { date: '2026-11-09T12:00', value: 0.2 },
      { date: '2026-11-09T20:00', value: 0.1 },
      { date: '2026-11-10T00:00', value: 0.1 },
      { date: '2026-11-10T07:00', value: 0.1 },
      { date: '2026-11-10T09:00', value: 0.1 },
    ]);
    expect(gas.total).toBe(0.6);
    expect(gas.note).toContain('清零');

    const runtime = collect(device1Runtime, PRIOR_RESET);
    expect(runtime.days).toEqual([
      { date: '2026-11-09T12:00', value: 6 },
      { date: '2026-11-10T00:00', value: 3 },
      { date: '2026-11-10T07:00', value: 1 },
    ]);
    expect(runtime.total).toBe(10);

    const water = collect(device1Water, PRIOR_RESET);
    expect(water.days.find((day) => day.date === '2026-11-09T11:00')?.value).toBe(9.8);
    expect(water.days.find((day) => day.date === '2026-11-09T12:00')?.value).toBe(124);
  });

  it('recovers the second device opening pulses without touching later hours', () => {
    const gas = scaled(
      [
        ['2026-11-10T09:29:21.397+08:00', 1],
        ['2026-11-10T09:29:22.443+08:00', 0],
      ],
      1,
    );
    expect(collect(gas, null).days).toEqual([{ date: '2026-11-10T09:00', value: 0 }]);
    expect(collect(gas, PRIOR_RESET).days).toEqual([{ date: '2026-11-10T09:00', value: 0.1 }]);

    const runtime = scaled(
      [
        ['2026-11-09T13:00:24.606+08:00', 1],
        ['2026-11-09T13:00:25.607+08:00', 0],
        ['2026-11-09T18:30:23.569+08:00', 1],
        ['2026-11-09T18:30:24.548+08:00', 0],
        ['2026-11-10T09:29:21.401+08:00', 1],
        ['2026-11-10T09:29:22.446+08:00', 0],
      ],
      0,
    );
    expect(collect(runtime, null).days.find((day) => day.date === '2026-11-09T13:00')?.value).toBe(0);
    expect(collect(runtime, PRIOR_RESET).days).toEqual([
      { date: '2026-11-09T13:00', value: 1 },
      { date: '2026-11-09T18:00', value: 1 },
      { date: '2026-11-10T09:00', value: 1 },
    ]);

    const water = scaled(
      [
        ['2026-11-09T12:30:24.330+08:00', 98],
        ['2026-11-09T12:30:25.330+08:00', 0],
        ['2026-11-09T13:00:24.605+08:00', 130],
        ['2026-11-09T13:00:25.603+08:00', 0],
      ],
      1,
    );
    expect(collect(water, null).days.find((day) => day.date === '2026-11-09T12:00')?.value).toBe(0);
    const anchored = collect(water, PRIOR_RESET);
    expect(anchored.days.find((day) => day.date === '2026-11-09T12:00')?.value).toBe(9.8);
    expect(anchored.days.find((day) => day.date === '2026-11-09T13:00')?.value).toBe(13);
  });

  it('recovers the third device gas pulse and does not invent runtime', () => {
    const gas = scaled(
      [
        ['2026-11-10T07:30:09.757+08:00', 1],
        ['2026-11-10T07:30:10.757+08:00', 0],
      ],
      1,
    );
    expect(collect(gas, null).days).toEqual([{ date: '2026-11-10T07:00', value: 0 }]);
    const anchored = collect(gas, PRIOR_RESET);
    expect(anchored.days).toEqual([{ date: '2026-11-10T07:00', value: 0.1 }]);
    expect(anchored.total).toBe(0.1);

    const runtime = collect([], PRIOR_RESET);
    expect(runtime.days).toEqual([]);
    expect(runtime.total).toBe(0);
    expect(runtime.note).toBeNull();
  });

  it('diffs a lifetime total from the pre-window reading and never adds that reading', () => {
    const from = new Date('2026-10-21T16:00:00.000Z');
    const to = new Date('2026-10-22T16:00:00.000Z');
    const samples = [at('2026-10-22T00:00:00.000Z', 1005), at('2026-10-22T06:00:00.000Z', 1010)];
    const anchored = collect(samples, at('2026-10-21T12:00:00.000Z', 1000), 'hour', from, to);
    expect(anchored.total).toBe(10);
    expect(anchored.days.every((day) => day.value < 100)).toBe(true);
    expect(anchored.note).toBeNull();

    const opening = collect(
      [at('2026-10-22T00:00:00.000Z', 1000), at('2026-10-22T06:00:00.000Z', 1005)],
      null,
      'hour',
      from,
      to,
    );
    expect(opening.total).toBe(5);
  });

  it('ignores a repeated peak, accepts reversed input, and rounds 0.1 plus 0.2', () => {
    const reversed = [...device1Gas].reverse();
    expect(collect(reversed, PRIOR_RESET).total).toBe(0.6);

    const duplicated = [
      device1Gas[0],
      { t: device1Gas[0].t + 50, value: device1Gas[0].value },
      ...device1Gas.slice(1),
    ];
    expect(collect(duplicated, PRIOR_RESET).days[0]).toEqual({ date: '2026-11-09T12:00', value: 0.2 });

    const tenths = collect(
      [at('2026-11-09T12:00:25+08:00', 0.2), at('2026-11-09T12:00:26+08:00', 0), at('2026-11-09T20:29:53+08:00', 0.1), at('2026-11-09T20:29:54+08:00', 0)],
      PRIOR_RESET,
    );
    expect(tenths.total).toBe(0.3);
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

    const cycle = collect(device1Gas, PRIOR_RESET, 'day');
    expect(cycle.days.find((day) => day.date === '2026-11-09')?.value).toBe(0.3);
    expect(cycle.total).toBeLessThanOrEqual(0.6);
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
