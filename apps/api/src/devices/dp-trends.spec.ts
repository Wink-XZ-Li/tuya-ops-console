import {
  aggregateDpSeries,
  applyDpScale,
  bucketForRange,
  bucketStartMs,
  buildDpTrends,
  chooseTrendCodes,
  extractDpSamples,
  TREND_BUCKETS,
} from './dp-trends';

const schema = [
  { id: 1, code: 'temp', name: '出水温度', type: 'value', values: { scale: 1, unit: '℃' } },
  { id: 2, code: 'switch', name: '开关', type: 'bool', values: {} },
  { id: 3, code: 'fault', name: '故障告警', type: 'fault', values: { scale: 0 } },
  { id: 4, code: 'flow', name: '水流量', type: 'value', values: { scale: 0, unit: 'L/min' } },
  { id: 5, code: 'power', name: '功率', type: 'value', values: { scale: 0, unit: 'W' } },
];

describe('dp trend buckets', () => {
  it('picks 5min, 1h, and 1d from the requested span', () => {
    expect(bucketForRange(24 * 60 * 60 * 1000)).toBe('5min');
    expect(bucketForRange(7 * 24 * 60 * 60 * 1000)).toBe('1h');
    expect(bucketForRange(30 * 24 * 60 * 60 * 1000)).toBe('1d');
    expect(bucketForRange(8 * 24 * 60 * 60 * 1000)).toBe('1d');
  });

  it('aligns day buckets to Asia/Shanghai midnight and keeps sub-day buckets on the clock', () => {
    expect(bucketStartMs(Date.parse('2026-10-22T16:30:00.000Z'), '1d')).toBe(
      Date.parse('2026-10-22T16:00:00.000Z'),
    );
    expect(bucketStartMs(Date.parse('2026-10-22T15:00:00.000Z'), '1d')).toBe(
      Date.parse('2026-10-21T16:00:00.000Z'),
    );
    expect(bucketStartMs(Date.parse('2026-10-22T00:07:00.000Z'), '5min')).toBe(
      Date.parse('2026-10-22T00:05:00.000Z'),
    );
    expect(TREND_BUCKETS['1h']).toBe(60 * 60 * 1000);
  });
});

describe('dp trend aggregation', () => {
  const from = new Date('2026-10-22T00:00:00.000Z');
  const to = new Date('2026-10-22T03:00:00.000Z');

  it('averages a bucket and leaves the empty hour out instead of inserting 0', () => {
    const events = [
      {
        eventTime: new Date('2026-10-22T00:10:00.000Z'),
        payload: {
          status: [
            { code: 'temp', value: 100 },
            { code: 'temp', value: 300, time: Date.parse('2026-10-22T00:40:00.000Z') },
            { code: 'switch', value: true },
            { code: 'fault', value: 2 },
          ],
        },
      },
      {
        eventTime: new Date('2026-10-22T02:15:00.000Z'),
        payload: { properties: [{ code: 'temp', value: '120' }] },
      },
    ];
    const series = buildDpTrends({
      events,
      schema,
      defaults: [],
      requested: ['temp'],
      from,
      to,
      bucket: '1h',
    });

    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ dpId: 'temp', name: '出水温度', unit: '℃' });
    expect(series[0]?.points).toEqual([
      { t: '2026-10-22T00:00:00.000Z', avg: 20, min: 10, max: 30 },
      { t: '2026-10-22T02:00:00.000Z', avg: 12, min: 12, max: 12 },
    ]);
    expect(series[0]?.points.some((point) => point.avg === 0)).toBe(false);
  });

  it('uses product defaults, otherwise the 7-day top 3 numeric reports', () => {
    const events = ['flow', 'flow', 'flow', 'power', 'power', 'temp', 'switch', 'fault'].map(
      (code, index) => ({
        eventTime: new Date(from.getTime() + index * 60_000),
        payload: { status: [{ code, value: code === 'switch' ? true : index + 1 }] },
      }),
    );
    const top = buildDpTrends({
      events,
      schema,
      defaults: [],
      requested: [],
      from,
      to: new Date('2026-10-23T00:00:00.000Z'),
      bucket: '1h',
    });
    expect(top.map((series) => series.dpId)).toEqual(['flow', 'power', 'temp']);

    const preferred = chooseTrendCodes({
      requested: [],
      defaults: ['temp'],
      counts: new Map([
        ['flow', 9],
        ['temp', 1],
      ]),
      numericCodes: new Set(['temp', 'flow', 'power']),
    });
    expect(preferred).toEqual(['temp']);
  });

  it('returns an empty series instead of throwing when nothing was reported', () => {
    const series = buildDpTrends({
      events: [],
      schema,
      defaults: [],
      requested: ['temp'],
      from,
      to,
      bucket: '5min',
    });
    expect(series).toEqual([{ dpId: 'temp', name: '出水温度', unit: '℃', points: [] }]);
  });

  it('scales raw values and ignores booleans at extract time', () => {
    expect(applyDpScale(255, 1)).toBe(25.5);
    expect(applyDpScale(255, 0)).toBe(255);
    expect(
      extractDpSamples(
        { status: [{ code: 'switch', value: false }, { code: 'mode', value: 'high' }] },
        from,
      ),
    ).toEqual([]);
    const points = aggregateDpSeries(
      [
        { code: 'temp', t: from.getTime(), value: 1 },
        { code: 'temp', t: from.getTime() + 60_000, value: 2 },
      ],
      ['temp'],
      from.getTime(),
      to.getTime(),
      '1h',
    );
    expect(points[0]?.points[0]).toMatchObject({ avg: 1.5, min: 1, max: 2 });
  });
});
