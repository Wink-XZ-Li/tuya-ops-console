import { buildStatusTimeline, normalizeStatusValue, statusBarDpsForProduct, statusLabel } from './status-bars';

describe('statusBarDpsForProduct', () => {
  it('keeps enum and bool operating states and drops numeric meters', () => {
    const heater = statusBarDpsForProduct('1x0qz5jtlabxywcg');
    expect(heater.map((dp) => [dp.dpId, dp.type, dp.name])).toEqual([
      ['work_state', 'enum', '工作状态'],
      ['flame_status', 'bool', '火焰状态'],
      ['fan_status', 'bool', '风机状态'],
      ['water_flow_status', 'bool', '水流状态'],
    ]);
    expect(heater.find((dp) => dp.dpId === 'work_state')?.range).toEqual([
      'code_standby',
      'hot_standby',
      'heating',
    ]);
    expect(heater.some((dp) => dp.dpId === 'temp_current' || dp.dpId === 'gas_consumption')).toBe(false);
    expect(statusBarDpsForProduct('0wyzpxylwzjx6gej')).toEqual([]);
  });

  it('skips an enum whose only choice is undefined', () => {
    const electric = statusBarDpsForProduct('3gnar3yb3w4dn0ik');
    expect(electric.map((dp) => dp.dpId)).toEqual(['heating', 'flow']);
    expect(electric.find((dp) => dp.dpId === 'mode')).toBeUndefined();
  });
});

describe('buildStatusTimeline', () => {
  const from = new Date('2026-10-16T00:00:00.000Z');
  const to = new Date('2026-10-23T00:00:00.000Z');
  const work = {
    name: '工作状态',
    type: 'enum' as const,
    range: ['code_standby', 'hot_standby', 'heating'],
  };

  it('carries the last report into the window and splits when the value changes', () => {
    const segments = buildStatusTimeline({
      from,
      to,
      prior: { t: Date.parse('2026-10-15T00:00:00.000Z'), value: 'code_standby' },
      points: [
        { t: Date.parse('2026-10-20T00:00:00.000Z'), value: 'heating' },
        { t: Date.parse('2026-10-20T02:00:00.000Z'), value: 'heating' },
        { t: Date.parse('2026-10-24T00:00:00.000Z'), value: 'hot_standby' },
      ],
      labelOf: (value) => statusLabel(work, value),
    });

    expect(segments).toEqual([
      {
        tStart: '2026-10-16T00:00:00.000Z',
        tEnd: '2026-10-20T00:00:00.000Z',
        value: 'code_standby',
        label: '冷待机',
      },
      {
        tStart: '2026-10-20T00:00:00.000Z',
        tEnd: '2026-10-23T00:00:00.000Z',
        value: 'heating',
        label: '加热',
      },
    ]);
  });

  it('leaves the leading stretch unknown when nothing was reported before it', () => {
    const segments = buildStatusTimeline({
      from,
      to,
      prior: null,
      points: [{ t: Date.parse('2026-10-21T00:00:00.000Z'), value: 'true' }],
      labelOf: (value) => statusLabel({ name: '火焰状态', type: 'bool' }, value),
    });

    expect(segments.map((segment) => [segment.value, segment.label])).toEqual([
      [null, '未知'],
      ['true', '燃烧中'],
    ]);
    expect(segments.some((segment) => segment.value === 'false')).toBe(false);
  });

  it('reads bools and enum indexes without treating them as numbers for a trend', () => {
    expect(normalizeStatusValue({ type: 'bool', range: [] }, true)).toBe('true');
    expect(normalizeStatusValue({ type: 'bool', range: [] }, 0)).toBe('false');
    expect(normalizeStatusValue(work, 2)).toBe('heating');
    expect(normalizeStatusValue(work, 'undefined')).toBeNull();
    expect(normalizeStatusValue({ type: 'enum', range: ['a'] }, 40)).toBeNull();
  });
});
