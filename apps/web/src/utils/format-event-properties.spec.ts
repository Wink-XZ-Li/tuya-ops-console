import { eventPropertyLines } from './format-event-properties';

describe('eventPropertyLines', () => {
  it('names properties and scales values from an IoT Core properties array', () => {
    const lines = eventPropertyLines(
      {
        properties: [
          { code: 'water_pressure', dpId: 9, value: 12 },
          { code: 'switch', value: true },
        ],
      },
      [
        {
          code: 'water_pressure',
          name: '采暖水压',
          id: 9,
          type: 'value',
          values: { scale: 1, unit: 'bar', type: 'value' },
        },
        { code: 'switch', name: '开关', type: 'bool', values: { type: 'bool' } },
      ],
    );
    expect(lines).toEqual([
      { name: '采暖水压', value: '1.2bar' },
      { name: '开关', value: '开' },
    ]);
  });

  it('uses cloud function names and units when there is no local schema', () => {
    const lines = eventPropertyLines(
      { properties: [{ code: 'total_usage_time', dpId: 108, value: 8 }] },
      [
        {
          code: 'total_usage_time',
          name: '累计使用时长',
          type: 'integer',
          values: { type: 'value', scale: 0, unit: '小时' },
        },
      ],
    );
    expect(lines).toEqual([{ name: '累计使用时长', value: '8小时' }]);
  });

  it('prefers an operator alias and decodes a fault bitmap', () => {
    const lines = eventPropertyLines({ status: [{ code: 'fault', value: 32 }] }, [
      {
        code: 'fault',
        name: '故障告警',
        alias: '故障位',
        type: 'bitmap',
        values: { label: ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'], type: 'bitmap' },
      },
    ]);
    expect(lines).toEqual([{ name: '故障位', value: 'E5' }]);
  });

  it('returns nothing for online messages', () => {
    expect(eventPropertyLines({ devId: 'abc' }, [])).toEqual([]);
  });
});
