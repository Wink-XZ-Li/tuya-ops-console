import { getProductDps, type ProductDp } from './product-dp-schemas';

/**
 * Operating-state DPs drawn as status ribbons.
 * Kept in sync with apps/web/src/utils/status-bars.ts.
 * Numeric DPs stay out. Installer switches, power `switch`, and unit settings stay out.
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

export type StatusBarType = 'enum' | 'bool';

export type StatusBarDp = {
  /** DP code. Property events store this, or a numeric id resolved to it. */
  dpId: string;
  name: string;
  type: StatusBarType;
  range: string[];
};

export type StatusPoint = { t: number; value: string };

export type StatusSegment = {
  tStart: string;
  tEnd: string;
  value: string | null;
  label: string;
};

const ENUM_LABELS: Record<string, string> = {
  code_standby: '冷待机',
  hot_standby: '热待机',
  heating: '加热',
  standby: '待机',
  off: '关机',
  shower_heating: '卫浴加热',
  warm_heating: '采暖加热',
  antifreeze: '防冻',
  anti_freeze: '防冻',
  appointment: '预约',
  cooking: '烹饪',
  done: '完成',
  work: '运行',
  briner_fill: '补盐',
  fastrinse: '快洗',
  salt_absorption: '吸盐',
  dissolved_salt: '溶盐',
  back_wash: '反洗',
  Err: '故障',
  working: '工作中',
  fault: '故障',
  bath_heating: '卫浴加热',
  zc_heating: '零冷水加热',
  circulation: '循环',
  cooling: '制冷',
  ventilation: '通风',
  auto: '自动',
  smart: '智能',
  eco: '节能',
  comfortable: '舒适',
  manual: '手动',
  sleeping: '休眠',
  sleep: '睡眠',
  warming: '保温',
  holiday: '假日',
  energy: '节能',
  wind: '送风',
  dry: '除湿',
  program: '程序',
  floor_heat: '地暖',
  pending_cool: '待制冷',
  idle: '空闲',
  fan: '风机',
  air: '新风',
  cold: '制冷',
  hot: '制热',
  auto_clean: '自清洁',
  anti_clockwise: '逆时针',
  wet: '潮湿',
};

export function statusBarDpsFromSchema(schema: ProductDp[]): StatusBarDp[] {
  const bars: StatusBarDp[] = [];
  for (const code of STATUS_BAR_CODES) {
    for (const dp of schema) {
      if (dp.code !== code || !isStatusBarDp(dp)) continue;
      const range = enumRange(dp);
      bars.push({
        dpId: dp.code,
        name: dp.name,
        type: dp.type === 'bool' ? 'bool' : 'enum',
        range,
      });
    }
  }
  return bars;
}

export function statusBarDpsForProduct(productId: string): StatusBarDp[] {
  return statusBarDpsFromSchema(getProductDps(productId));
}

export function isStatusBarDp(dp: ProductDp): boolean {
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

export function normalizeStatusValue(dp: Pick<StatusBarDp, 'type' | 'range'>, raw: unknown): string | null {
  if (dp.type === 'bool') {
    if (raw === true || raw === 1 || raw === '1' || raw === 'true') return 'true';
    if (raw === false || raw === 0 || raw === '0' || raw === 'false') return 'false';
    return null;
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text || text === 'undefined') return null;
    return text;
  }
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < dp.range.length) {
    return dp.range[raw] ?? null;
  }
  return null;
}

export function statusLabel(dp: Pick<StatusBarDp, 'name' | 'type'>, value: string): string {
  if (dp.type === 'bool') return boolLabel(dp.name, value === 'true');
  return ENUM_LABELS[value] ?? value;
}

/**
 * Paint [from, to] for one DP.
 * The last report before `from` carries its value in. No report at all leaves the stretch unknown.
 */
export function buildStatusTimeline(input: {
  from: Date;
  to: Date;
  prior: StatusPoint | null;
  points: StatusPoint[];
  labelOf: (value: string) => string;
}): StatusSegment[] {
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];

  const points = input.points
    .filter((point) => point.t >= fromMs && point.t <= toMs && point.value)
    .sort((a, b) => a.t - b.t);

  let value: string | null = null;
  if (input.prior && input.prior.t < fromMs && input.prior.value) value = input.prior.value;

  const raw: Array<{ value: string | null; from: number; to: number }> = [];
  let cursor = fromMs;
  for (const point of points) {
    if (point.t > cursor) raw.push({ value, from: cursor, to: point.t });
    value = point.value;
    cursor = Math.max(cursor, point.t);
  }
  if (toMs > cursor) raw.push({ value, from: cursor, to: toMs });

  const merged: Array<{ value: string | null; from: number; to: number }> = [];
  for (const segment of raw) {
    if (segment.to <= segment.from) continue;
    const last = merged[merged.length - 1];
    if (last && last.value === segment.value && last.to === segment.from) {
      last.to = segment.to;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged.map((segment) => ({
    tStart: new Date(segment.from).toISOString(),
    tEnd: new Date(segment.to).toISOString(),
    value: segment.value,
    label: segment.value == null ? '未知' : input.labelOf(segment.value),
  }));
}

function enumRange(dp: ProductDp): string[] {
  const range = dp.values?.range;
  if (!Array.isArray(range)) return [];
  return range.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
}

function boolLabel(name: string, on: boolean): string {
  if (/火焰|燃烧/.test(name)) return on ? '燃烧中' : '未燃烧';
  if (/防冻/.test(name)) return on ? '防冻中' : '未防冻';
  if (/加热|供暖/.test(name)) return on ? '加热中' : '未加热';
  if (/水流/.test(name)) return on ? '有水流' : '无水流';
  if (/风机/.test(name)) return on ? '运转' : '停止';
  if (/卫浴/.test(name)) return on ? '卫浴中' : '未开启';
  if (/冲洗/.test(name)) return on ? '冲洗中' : '未冲洗';
  return on ? '开' : '关';
}
