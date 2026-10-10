import { extractModeLabel, faultCodeOf } from './rollup.job';

describe('faultCodeOf', () => {
  it('prefers source then title', () => {
    expect(faultCodeOf('local_offline', '设备长时间离线')).toBe('local_offline');
    expect(faultCodeOf('', 'sensor error')).toBe('sensor error');
    expect(faultCodeOf('  ', '  ')).toBe('unknown');
  });
});

describe('extractModeLabel', () => {
  it('reads mode from status array', () => {
    expect(extractModeLabel([{ code: 'mode', value: 'auto' }])).toBe('auto');
    expect(extractModeLabel([{ code: 'eco', value: true }])).toBe('eco');
    expect(extractModeLabel([{ code: 'sleep', value: false }])).toBeNull();
  });

  it('reads nested status object', () => {
    expect(
      extractModeLabel({ status: [{ code: 'work_mode', value: 'cool' }] }),
    ).toBe('cool');
  });
});
