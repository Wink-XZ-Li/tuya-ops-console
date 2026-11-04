import {
  DEFAULT_DEVICE_SOFT_CAP,
  deviceSoftCapLog,
  isOverDeviceSoftCap,
  readAppProfile,
  readDeviceSoftCap,
  softCapReconcileWarning,
} from './runtime-profile';

describe('readAppProfile', () => {
  it('defaults to demo', () => {
    expect(readAppProfile({})).toBe('demo');
  });

  it('accepts production and prod', () => {
    expect(readAppProfile({ APP_PROFILE: 'production' })).toBe('production');
    expect(readAppProfile({ APP_PROFILE: 'PROD' })).toBe('production');
  });

  it('treats unknown values as demo', () => {
    expect(readAppProfile({ APP_PROFILE: 'staging' })).toBe('demo');
  });
});

describe('readDeviceSoftCap', () => {
  it('defaults to 10000 when unset', () => {
    expect(readDeviceSoftCap({})).toBe(DEFAULT_DEVICE_SOFT_CAP);
    expect(DEFAULT_DEVICE_SOFT_CAP).toBe(10_000);
  });

  it('reads a positive cap', () => {
    expect(readDeviceSoftCap({ DEVICE_SOFT_CAP: '3000' })).toBe(3000);
    expect(readDeviceSoftCap({ DEVICE_SOFT_CAP: ' 10.9 ' })).toBe(10);
  });

  it('treats 0, none, unlimited, and off as no cap', () => {
    expect(readDeviceSoftCap({ DEVICE_SOFT_CAP: '0' })).toBeNull();
    expect(readDeviceSoftCap({ DEVICE_SOFT_CAP: 'none' })).toBeNull();
    expect(readDeviceSoftCap({ DEVICE_SOFT_CAP: 'unlimited' })).toBeNull();
    expect(readDeviceSoftCap({ DEVICE_SOFT_CAP: 'off' })).toBeNull();
  });

  it('falls back to the default for invalid values', () => {
    expect(readDeviceSoftCap({ DEVICE_SOFT_CAP: 'abc' })).toBe(DEFAULT_DEVICE_SOFT_CAP);
    expect(readDeviceSoftCap({ DEVICE_SOFT_CAP: '-5' })).toBe(DEFAULT_DEVICE_SOFT_CAP);
  });
});

describe('device soft cap policy', () => {
  it('warns at the cap and never describes a reject', () => {
    expect(isOverDeviceSoftCap(50, 3000)).toBe(false);
    expect(isOverDeviceSoftCap(3000, 3000)).toBe(true);
    expect(isOverDeviceSoftCap(50, null)).toBe(false);
    expect(deviceSoftCapLog(3000, 3000, 'deviceId=d51')).toContain('action=accept');
    expect(deviceSoftCapLog(3000, 3000)).not.toMatch(/skip|drop|truncat/i);
  });

  it('does not warn a 51st device under a 3000 cap, and warns without a stop when over', () => {
    expect(softCapReconcileWarning(50, 1, { DEVICE_SOFT_CAP: '3000' })).toBeNull();
    const over = softCapReconcileWarning(3000, 1, { DEVICE_SOFT_CAP: '3000' });
    expect(over).toContain('action=accept');
    expect(over).toContain('cap=3000');
    expect(softCapReconcileWarning(10, 4000, { DEVICE_SOFT_CAP: '3000' })).toContain('cloudTotal=4000');
    expect(softCapReconcileWarning(20_000, 1, { DEVICE_SOFT_CAP: 'none' })).toBeNull();
  });
});
