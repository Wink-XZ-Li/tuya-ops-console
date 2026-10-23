import { beforeEach, describe, expect, it } from 'vitest';
import {
  bucketForRange,
  readTrendSelection,
  splitTrendRuns,
  trendWindow,
  trendX,
  writeTrendSelection,
} from './dp-trend';

describe('dp trend window', () => {
  const now = new Date('2026-10-23T00:00:00.000Z');

  it('maps the three presets onto 5min, 1h, and 1d', () => {
    expect(bucketForRange(24 * 60 * 60 * 1000)).toBe('5min');
    expect(bucketForRange(7 * 24 * 60 * 60 * 1000)).toBe('1h');
    expect(bucketForRange(30 * 24 * 60 * 60 * 1000)).toBe('1d');
    expect(trendWindow('24h', now).bucket).toBe('5min');
    expect(trendWindow('7d', now).bucket).toBe('1h');
    expect(trendWindow('30d', now).bucket).toBe('1d');
    expect(trendWindow('7d', now).from).toBe('2026-10-16T00:00:00.000Z');
  });

  it('breaks a line across an empty bucket and aligns a fault to the same x as a point', () => {
    const runs = splitTrendRuns(
      [
        { t: '2026-10-20T00:00:00.000Z', avg: 40 },
        { t: '2026-10-20T02:00:00.000Z', avg: 41 },
      ],
      60 * 60 * 1000,
    );
    expect(runs).toHaveLength(2);
    expect(runs.flat().some((point) => point.avg === 0)).toBe(false);

    const from = Date.parse('2026-10-16T00:00:00.000Z');
    const to = Date.parse('2026-10-23T00:00:00.000Z');
    const at = Date.parse('2026-10-20T00:00:00.000Z');
    expect(trendX(at, from, to, 48, 560)).toBe(trendX(at, from, to, 48, 560));
    expect(trendX(from, from, to, 48, 560)).toBe(48);
    expect(trendX(to, from, to, 48, 560)).toBe(608);
  });
});

describe('dp trend selection memory', () => {
  beforeEach(() => localStorage.clear());

  it('remembers checked codes per product', () => {
    expect(readTrendSelection('pid-a')).toBeNull();
    writeTrendSelection('pid-a', ['temp_out']);
    writeTrendSelection('pid-b', ['power']);
    expect(readTrendSelection('pid-a')).toEqual(['temp_out']);
    expect(readTrendSelection('pid-b')).toEqual(['power']);
  });
});
