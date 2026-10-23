import { beforeEach, describe, expect, it } from 'vitest';
import {
  bucketForRange,
  isHiddenTrendDp,
  readTrendSelection,
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

  it('aligns a fault to the same x as a real sample', () => {
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
    writeTrendSelection('pid-c', ['ph', 'lhd', 'temp_out']);
    expect(readTrendSelection('pid-c')).toEqual(['temp_out']);
    writeTrendSelection('pid-d', ['ph', 'lhd']);
    expect(readTrendSelection('pid-d')).toBeNull();
    writeTrendSelection('pid-e', ['temp_set', 'temp_out']);
    expect(readTrendSelection('pid-e')).toEqual(['temp_out']);
    expect(isHiddenTrendDp({ code: 'ph', name: 'PH采暖最大比例阀电流' })).toBe(true);
    expect(isHiddenTrendDp({ code: 'lhd', name: 'LH-D（大气式）卫浴最大比例阀电流' })).toBe(true);
    expect(isHiddenTrendDp({ code: 'temp_set', name: '目标温度' })).toBe(true);
    expect(isHiddenTrendDp({ code: 'dhw_temp_set', name: '卫浴温度设置' })).toBe(true);
    expect(isHiddenTrendDp({ code: 'steam_cook_temp', name: '蒸箱温度设置' })).toBe(true);
    expect(isHiddenTrendDp({ code: 'temp_current', name: '当前温度' })).toBe(false);
    expect(isHiddenTrendDp({ code: 'steam_temp_current', name: '蒸箱当前温度' })).toBe(false);
  });
});
