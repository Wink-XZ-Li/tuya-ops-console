import { readSyncPageIntervalMs, readSyncPageSize, readSyncUserPageSize, waitMs } from './sync-pacing';

describe('sync pacing', () => {
  it('defaults device pages to 20 and user pages to 100', () => {
    expect(readSyncPageSize({})).toBe(20);
    expect(readSyncUserPageSize({})).toBe(100);
    expect(readSyncPageSize({ SYNC_PAGE_SIZE: '50' })).toBe(50);
    expect(readSyncPageSize({ SYNC_PAGE_SIZE: '500' })).toBe(100);
    expect(readSyncPageSize({ SYNC_PAGE_SIZE: '0' })).toBe(20);
  });

  it('defaults the page gap to 200ms and allows turning it off', () => {
    expect(readSyncPageIntervalMs({})).toBe(200);
    expect(readSyncPageIntervalMs({ SYNC_PAGE_INTERVAL_MS: '0' })).toBe(0);
    expect(readSyncPageIntervalMs({ SYNC_PAGE_INTERVAL_MS: 'off' })).toBe(0);
    expect(readSyncPageIntervalMs({ SYNC_PAGE_INTERVAL_MS: '1500' })).toBe(1500);
  });

  it('does not sleep when the gap is zero', async () => {
    const started = Date.now();
    await waitMs(0);
    expect(Date.now() - started).toBeLessThan(50);
  });
});
