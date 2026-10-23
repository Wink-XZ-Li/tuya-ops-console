import { describe, expect, it } from 'vitest';
import { statusBarDpsForProduct, statusTone } from './status-bars';

describe('status bar config', () => {
  it('shows operating states for a heater and hides a product with none', () => {
    expect(statusBarDpsForProduct('1x0qz5jtlabxywcg').map((dp) => dp.dpId)).toEqual([
      'work_state',
      'flame_status',
      'fan_status',
      'water_flow_status',
    ]);
    expect(statusBarDpsForProduct('0wyzpxylwzjx6gej')).toEqual([]);
    expect(statusBarDpsForProduct('pid-1')).toEqual([]);
  });

  it('paints bools in two tones and enums by their range order', () => {
    expect(statusTone('bool', null, [])).toBe('is-unknown');
    expect(statusTone('bool', 'true', [])).toBe('is-on');
    expect(statusTone('bool', 'false', [])).toBe('is-off');
    expect(statusTone('enum', 'heating', ['code_standby', 'hot_standby', 'heating'])).toBe('is-v2');
  });
});
