import { beforeEach, describe, expect, it } from 'vitest';
import {
  DATA_MODE_STORAGE_KEY,
  readDataMode,
  reconcileDataMode,
  writeDataMode,
} from './preference';

describe('data mode preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers a manual choice across reads', () => {
    writeDataMode({ mode: 'virtual', manual: true, quotaExhausted: true });
    expect(readDataMode()).toEqual({ mode: 'virtual', manual: true, quotaExhausted: true });
    expect(JSON.parse(localStorage.getItem(DATA_MODE_STORAGE_KEY) ?? '{}')).toEqual({
      mode: 'virtual',
      manual: true,
      quotaExhausted: true,
    });
  });

  it('switches to virtual when quota is exhausted unless the user pinned live', () => {
    const autoLive = { mode: 'live' as const, manual: false, quotaExhausted: false };
    expect(
      reconcileDataMode(autoLive, { virtual: true, quotaExhausted: true }),
    ).toEqual({ mode: 'virtual', manual: false, quotaExhausted: true });

    const manualLive = { mode: 'live' as const, manual: true, quotaExhausted: false };
    expect(
      reconcileDataMode(manualLive, { virtual: true, quotaExhausted: true }),
    ).toEqual({ mode: 'live', manual: true, quotaExhausted: true });
  });

  it('keeps a manual virtual choice and the quota flag after refresh', () => {
    const manualVirtual = { mode: 'virtual' as const, manual: true, quotaExhausted: false };
    const next = reconcileDataMode(manualVirtual, { virtual: true, quotaExhausted: true });
    expect(next).toEqual({ mode: 'virtual', manual: true, quotaExhausted: true });
    writeDataMode(next);
    expect(readDataMode().mode).toBe('virtual');
    expect(readDataMode().manual).toBe(true);
  });
});
