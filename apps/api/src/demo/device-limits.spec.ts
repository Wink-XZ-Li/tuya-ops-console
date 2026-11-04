import { DEFAULT_DEMO_SEED_DEVICE_CAP, readDemoSeedDeviceCap } from './device-limits';

describe('readDemoSeedDeviceCap', () => {
  it('defaults to 50 and is not a production ingest cap', () => {
    expect(DEFAULT_DEMO_SEED_DEVICE_CAP).toBe(50);
    expect(readDemoSeedDeviceCap({})).toBe(50);
  });

  it('reads a positive override and ignores invalid values', () => {
    expect(readDemoSeedDeviceCap({ DEMO_SEED_DEVICE_CAP: '12' })).toBe(12);
    expect(readDemoSeedDeviceCap({ DEMO_SEED_DEVICE_CAP: '0' })).toBe(50);
    expect(readDemoSeedDeviceCap({ DEMO_SEED_DEVICE_CAP: 'nope' })).toBe(50);
  });
});
