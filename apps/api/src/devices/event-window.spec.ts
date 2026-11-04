import { readFileSync } from 'fs';
import { join } from 'path';
import {
  LONG_WINDOW_MAX_POINTS,
  SHORT_WINDOW_MS,
  downsampleLastPerBucket,
  isShortEventWindow,
  longWindowBucketMs,
} from './event-window';

describe('event window', () => {
  it('treats 24h as a short scan and 7 days as a long window', () => {
    const to = new Date('2026-11-04T00:00:00.000Z');
    const day = new Date(to.getTime() - SHORT_WINDOW_MS);
    const week = new Date(to.getTime() - 7 * SHORT_WINDOW_MS);
    expect(isShortEventWindow(day, to)).toBe(true);
    expect(isShortEventWindow(week, to)).toBe(false);
  });

  it('caps a dense 7-day series at the point budget', () => {
    const from = new Date('2026-10-28T00:00:00.000Z');
    const to = new Date('2026-11-04T00:00:00.000Z');
    const bucketMs = longWindowBucketMs(from, to);
    const points = Array.from({ length: 9000 }, (_, index) => ({
      t: from.getTime() + index * 60_000,
      value: index,
    })).filter((point) => point.t <= to.getTime());
    const kept = downsampleLastPerBucket(points, from.getTime(), bucketMs);
    expect(points.length).toBeGreaterThan(LONG_WINDOW_MAX_POINTS);
    expect(kept.length).toBeLessThanOrEqual(LONG_WINDOW_MAX_POINTS);
    expect(kept[kept.length - 1].t).toBeGreaterThan(kept[0].t);
  });

  it('does not blind-take 4000 or 8000 events in the detail service', () => {
    const src = readFileSync(join(__dirname, 'devices.service.ts'), 'utf8');
    expect(src).not.toMatch(/take:\s*8000/);
    expect(src).not.toMatch(/take:\s*4000/);
    expect(src).not.toMatch(/take:\s*2000/);
  });
});
