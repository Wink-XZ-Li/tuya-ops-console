import {
  isTrialQuotaExhausted,
  TrialQuotaGate,
  TRIAL_QUOTA_COOLDOWN_MS,
  TUYA_TRIAL_QUOTA_EXHAUSTED_CODE,
} from './trial-quota';

describe('isTrialQuotaExhausted', () => {
  it('marks IoT Core trial quota exhaustion from the live client error', () => {
    const err = new Error(
      'Tuya getAppDeviceStat failed: [28841004] IoT Core trial quota is exhausted',
    );
    expect(isTrialQuotaExhausted(err)).toBe(true);
  });

  it('matches the quota sentence without requiring the numeric code', () => {
    expect(isTrialQuotaExhausted('Trial quota is exhausted')).toBe(true);
    expect(isTrialQuotaExhausted({ code: TUYA_TRIAL_QUOTA_EXHAUSTED_CODE, msg: 'no' })).toBe(
      true,
    );
  });

  it('does not treat service expiry 28841002 as quota exhaustion', () => {
    expect(
      isTrialQuotaExhausted(
        'Tuya getAppDeviceStat failed: [28841002] IoT Core service is expired',
      ),
    ).toBe(false);
    expect(isTrialQuotaExhausted({ code: 28841002, msg: 'service expired' })).toBe(false);
    expect(isTrialQuotaExhausted(new Error('network down'))).toBe(false);
  });
});

describe('TrialQuotaGate', () => {
  it('stays exhausted through the cooldown and then allows another probe', () => {
    const gate = new TrialQuotaGate(TRIAL_QUOTA_COOLDOWN_MS);
    const start = Date.parse('2026-10-28T01:00:00Z');
    gate.markExhausted(start);
    expect(gate.isExhausted(start + 60_000)).toBe(true);
    expect(gate.isExhausted(start + TRIAL_QUOTA_COOLDOWN_MS)).toBe(false);
  });
});
