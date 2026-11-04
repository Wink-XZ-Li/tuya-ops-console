import { extractModeLabel, faultDurationMinutes, rollupFaultCode } from './rollup.job';

describe('rollupFaultCode', () => {
  it('uses faultCode and drops connectivity and offline', () => {
    expect(rollupFaultCode({ faultCode: 'E1', category: 'fault' })).toBe('E1');
    expect(rollupFaultCode({ faultCode: 'offline', category: 'connectivity' })).toBeNull();
    expect(rollupFaultCode({ faultCode: 'E3', category: 'connectivity' })).toBeNull();
    expect(rollupFaultCode({ faultCode: null, category: 'fault' })).toBeNull();
    expect(rollupFaultCode({ faultCode: '  ', category: 'fault' })).toBeNull();
    expect(rollupFaultCode({ faultCode: 'unknown', category: 'fault' })).toBeNull();
  });

  it('measures duration from conditionStartedAt', () => {
    const minutes = faultDurationMinutes({
      openedAt: new Date('2026-10-10T00:00:00Z'),
      conditionStartedAt: new Date('2026-10-10T00:10:00Z'),
      closedAt: new Date('2026-10-10T00:40:00Z'),
    });
    expect(minutes).toBe(30);
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
