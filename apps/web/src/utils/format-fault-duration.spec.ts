import { formatFaultDuration } from './format-fault-duration';

describe('formatFaultDuration', () => {
  it('shows minutes at or under 60, and at exactly 24 hours', () => {
    expect(formatFaultDuration(0)).toBe('0分钟');
    expect(formatFaultDuration(45)).toBe('45分钟');
    expect(formatFaultDuration(60)).toBe('60分钟');
    expect(formatFaultDuration(24 * 60)).toBe('1440分钟');
  });

  it('shows hours between 60 minutes and 24 hours', () => {
    expect(formatFaultDuration(61)).toBe('1H');
    expect(formatFaultDuration(90)).toBe('2H');
    expect(formatFaultDuration(23 * 60)).toBe('23H');
  });

  it('shows days above 24 hours', () => {
    expect(formatFaultDuration(24 * 60 + 1)).toBe('1天');
    expect(formatFaultDuration(36 * 60)).toBe('2天');
    expect(formatFaultDuration(48 * 60)).toBe('2天');
  });
});
