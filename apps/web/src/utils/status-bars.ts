import { getProductDps, type ProductDp } from '../constants/product-dp-schemas';

/**
 * Operating-state DPs for the status ribbon.
 * Kept in sync with apps/api/src/devices/status-bars.ts.
 */
export const STATUS_BAR_CODES = [
  'work_state',
  'status',
  'mode',
  'work_mode',
  'burning_state',
  'flame_status',
  'flame_state2',
  'antifreeze',
  'anti_freeze',
  'heat_state',
  'heating',
  'heating_state',
  'bathroom_state',
  'wash_state',
  'fan_status',
  'water_flow_status',
  'flow',
  'z1_state',
  'z2_state',
  'z3_state',
  'z4_state',
] as const;

export type StatusBarDp = {
  dpId: string;
  name: string;
  type: 'enum' | 'bool';
  range: string[];
};

export function statusBarDpsForProduct(productId: string): StatusBarDp[] {
  return statusBarDpsFromSchema(getProductDps(productId));
}

export function statusBarDpsFromSchema(schema: ProductDp[]): StatusBarDp[] {
  const bars: StatusBarDp[] = [];
  for (const code of STATUS_BAR_CODES) {
    for (const dp of schema) {
      if (dp.code !== code || !isStatusBarDp(dp)) continue;
      bars.push({
        dpId: dp.code,
        name: dp.name,
        type: dp.type === 'bool' ? 'bool' : 'enum',
        range: enumRange(dp),
      });
    }
  }
  return bars;
}

function isStatusBarDp(dp: ProductDp): boolean {
  if (dp.type !== 'enum' && dp.type !== 'bool') return false;
  if (!(STATUS_BAR_CODES as readonly string[]).includes(dp.code)) return false;
  if (dp.code === 'status' && !/工作|设备|状态|state/i.test(dp.name)) return false;
  if (dp.code === 'heating' && !/状态/.test(dp.name)) return false;
  if (dp.code === 'flow' && !/水流/.test(dp.name)) return false;
  if (dp.type === 'enum') {
    const range = enumRange(dp);
    if (range.length === 0 || range.every((value) => value === 'undefined')) return false;
  }
  return true;
}

function enumRange(dp: ProductDp): string[] {
  const range = dp.values?.range;
  if (!Array.isArray(range)) return [];
  return range.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
}

export function statusTone(type: 'enum' | 'bool', value: string | null, range: string[]): string {
  if (value == null) return 'is-unknown';
  if (type === 'bool') return value === 'true' ? 'is-on' : 'is-off';
  const index = range.indexOf(value);
  if (index >= 0) return `is-v${index % 8}`;
  let hash = 0;
  for (const ch of value) hash = (hash * 31 + ch.charCodeAt(0)) % 8;
  return `is-v${hash}`;
}
