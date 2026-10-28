import type {
  TuyaControlStatPoint,
  TuyaDeviceStatPoint,
  TuyaDevicesDatasSurvey,
  TuyaDevicesLiveDatasSurvey,
  TuyaLocationActivePoint,
  TuyaLocationDateType,
  TuyaRegisterStatPoint,
} from '../tuya/tuya.client';
import { summarizeFaultCodesByProduct } from './fault-code-breakdown';

/**
 * 汇报用稳态机群。数字固定，同一日期区间重复计算得到同一组值，刷新不会跳动。
 * 规模约 1.2 万台，在线率约 96%，故障率约 1.5%。与 TuyaMockClient 的个位数夹具分开。
 */
export const VIRTUAL_FLEET_TOTAL = 12480;

type ProductSlice = {
  productId: string;
  total: number;
  online: number;
  offline: number;
  fault: number;
};

type FaultWeight = {
  productId: string;
  faultCode: string;
  weight: number;
  live: number;
};

const PRODUCTS: ProductSlice[] = [
  { productId: '90wi2aimyqstn9qc', total: 4120, online: 3972, offline: 148, fault: 68 },
  { productId: 'nohrp3vbmef7vxvx', total: 3180, online: 3074, offline: 106, fault: 48 },
  { productId: 'ckjfqtnqqystvfaa', total: 2860, online: 2748, offline: 112, fault: 42 },
  { productId: 'uhmj5b0ba31zpme6', total: 1540, online: 1476, offline: 64, fault: 18 },
  { productId: 'qxjzruuqz40bty7e', total: 780, online: 736, offline: 44, fault: 10 },
];

const FAULT_WEIGHTS: FaultWeight[] = [
  { productId: '90wi2aimyqstn9qc', faultCode: 'E1', weight: 46, live: 22 },
  { productId: '90wi2aimyqstn9qc', faultCode: 'E4', weight: 28, live: 16 },
  { productId: '90wi2aimyqstn9qc', faultCode: 'E8', weight: 14, live: 11 },
  { productId: '90wi2aimyqstn9qc', faultCode: 'E0', weight: 9, live: 8 },
  { productId: '90wi2aimyqstn9qc', faultCode: 'E3', weight: 7, live: 11 },
  { productId: 'ckjfqtnqqystvfaa', faultCode: 'E1', weight: 32, live: 14 },
  { productId: 'ckjfqtnqqystvfaa', faultCode: 'E4', weight: 18, live: 12 },
  { productId: 'ckjfqtnqqystvfaa', faultCode: 'E6', weight: 11, live: 9 },
  { productId: 'ckjfqtnqqystvfaa', faultCode: 'E8', weight: 8, live: 7 },
  { productId: 'nohrp3vbmef7vxvx', faultCode: 'E1', weight: 24, live: 16 },
  { productId: 'nohrp3vbmef7vxvx', faultCode: 'E6', weight: 15, live: 14 },
  { productId: 'nohrp3vbmef7vxvx', faultCode: 'E5', weight: 9, live: 10 },
  { productId: 'nohrp3vbmef7vxvx', faultCode: 'E8', weight: 6, live: 8 },
  { productId: 'uhmj5b0ba31zpme6', faultCode: 'E1', weight: 12, live: 11 },
  { productId: 'uhmj5b0ba31zpme6', faultCode: 'E2', weight: 5, live: 7 },
  { productId: 'qxjzruuqz40bty7e', faultCode: 'E0', weight: 8, live: 6 },
  { productId: 'qxjzruuqz40bty7e', faultCode: 'E1', weight: 4, live: 4 },
];

const LOCATION_WEIGHTS: Array<[string, number]> = [
  ['广东', 2860],
  ['浙江', 1940],
  ['江苏', 1680],
  ['山东', 1210],
  ['河南', 980],
  ['四川', 860],
  ['上海', 640],
  ['北京', 520],
  ['湖北', 470],
  ['安徽', 390],
  ['其他', 930],
];

const FAULT_LOCATION_WEIGHTS: Array<[string, number]> = [
  ['广东', 42],
  ['浙江', 31],
  ['江苏', 27],
  ['山东', 22],
  ['河南', 18],
  ['四川', 14],
  ['上海', 12],
  ['北京', 8],
  ['其他', 12],
];

const MODE_WEIGHTS: Array<[string, number]> = [
  ['采暖', 4380],
  ['卫浴', 3140],
  ['待机', 2860],
  ['零冷水', 1560],
  ['制冷', 540],
];

const REGISTER_TOTAL = 9680;
const END_USERS = 8920;
const BINDING = { zero: 780, one: 5620, two: 1980, threePlus: 540 };
const COUNTRIES: Array<[string, number]> = [
  ['86', 8480],
  ['1', 260],
  ['84', 110],
  ['852', 70],
];
const OPEN_ALERTS = 57;
const PENDING_DEVICES = 41;
const AVG_DURATION_MINUTES = 214;
const FLEET_FAULT = PRODUCTS.reduce((sum, row) => sum + row.fault, 0);

export type VirtualRange = {
  startDay: string;
  endDay: string;
  productId?: string;
};

export function buildVirtualDashboard(query: VirtualRange) {
  const { startDay, endDay, scope } = prepare(query);
  const days = enumerateDays(startDay, endDay);
  const dailyNew = days.map((_, index) =>
    Math.max(1, activationBase(scope.total) + signed(index, activationAmp(scope.total))),
  );
  const newSum = dailyNew.reduce((sum, value) => sum + value, 0);
  let running = Math.max(scope.total - newSum, Math.round(scope.total * 0.9));
  const activeBase = Math.round(scope.total * 0.594);
  const activeAmp = Math.max(1, Math.round(scope.total * 0.012));
  const device: TuyaDeviceStatPoint[] = days.map((dt, index) => {
    running += dailyNew[index] ?? 0;
    if (index === days.length - 1) running = scope.total;
    const activeNum = clamp(activeBase + signed(index, activeAmp), 0, running);
    return {
      dt,
      activationNum: dailyNew[index] ?? 0,
      activationTotalNum: running,
      activeNum,
    };
  });

  const registerEnd = scaleCount(REGISTER_TOTAL, scope.total, VIRTUAL_FLEET_TOTAL);
  const registerDailyBase = Math.max(1, scaleCount(11, scope.total, VIRTUAL_FLEET_TOTAL));
  const registerDaily = days.map((_, index) =>
    Math.max(1, registerDailyBase + signed(index, Math.max(1, Math.round(registerDailyBase * 0.2)), 1)),
  );
  let registerRunning = Math.max(registerEnd - registerDaily.reduce((sum, value) => sum + value, 0), 0);
  const register: TuyaRegisterStatPoint[] = days.map((dt, index) => {
    registerRunning += registerDaily[index] ?? 0;
    if (index === days.length - 1) registerRunning = registerEnd;
    return {
      dt,
      todayRegisterNum: registerDaily[index] ?? 0,
      totalRegisterNum: registerRunning,
    };
  });

  const controlBase = Math.max(24, Math.round(scope.total * 0.52));
  const controlAmp = Math.max(2, Math.round(scope.total * 0.02));
  const controlUserBase = Math.max(12, Math.round(scope.total * 0.346));
  const controlUserAmp = Math.max(1, Math.round(scope.total * 0.012));
  const control: TuyaControlStatPoint[] = days.map((dt, index) => ({
    dt,
    controlNum: Math.max(1, controlBase + signed(index, controlAmp)),
    controlUserNum: Math.max(1, controlUserBase + signed(index, controlUserAmp, 2)),
  }));

  const lastDevice = device[device.length - 1];
  const lastRegister = register[register.length - 1];
  const locations = locationItems(scope.total);

  return {
    startDay,
    endDay,
    productId: query.productId?.trim() || null,
    cachedAt: new Date().toISOString(),
    fromCache: false,
    note: '演示数据：IoT Core 试用额度用完后的稳态机群样本，约 1.2 万台。同一区间的数字固定，刷新不会变化。',
    kpis: {
      activationTotal: lastDevice?.activationTotalNum ?? scope.total,
      activationNew: device.reduce((sum, row) => sum + row.activationNum, 0),
      activeLatest: lastDevice?.activeNum ?? 0,
      registerTotal: lastRegister?.totalRegisterNum ?? registerEnd,
      registerNew: register.reduce((sum, row) => sum + row.todayRegisterNum, 0),
      controlTotal: control.reduce((sum, row) => sum + row.controlNum, 0),
      controlUsers: control.reduce((sum, row) => sum + row.controlUserNum, 0),
    },
    series: { device, register, control },
    locations: {
      dateType: locationDateType(days.length),
      items: locations,
    },
    warnings: [] as string[],
  };
}

export function buildVirtualDevicesUsage(query: VirtualRange) {
  const { startDay, endDay, scope } = prepare(query);
  const days = enumerateDays(startDay, endDay);
  const onlineAmp = Math.max(1, Math.round(scope.online * 0.004));
  const faultAmp = Math.max(1, Math.round(scope.fault * 0.05));
  const dailyTrend = days.map((day, index) => {
    const onlineCount = clamp(scope.online + signed(index, onlineAmp), 1, scope.total);
    const faultCount = clamp(scope.fault + signed(index, faultAmp, 3), 0, scope.total);
    return {
      day,
      onlineCount,
      offlineCount: scope.total - onlineCount,
      faultCount,
      totalDevices: scope.total,
      onlineRate: rate(onlineCount, scope.total),
    };
  });

  const modeParts = allocate(
    scope.total,
    MODE_WEIGHTS.map(([, weight]) => weight),
  );
  const modeDistribution = MODE_WEIGHTS.map(([mode], index) => ({
    mode,
    count: modeParts[index] ?? 0,
  })).filter((row) => row.count > 0);

  const byProductDaily = dailyTrend.flatMap((row) => {
    const onlineParts = allocate(
      row.onlineCount,
      scope.products.map((item) => item.online),
    );
    const faultParts = allocate(
      row.faultCount,
      scope.products.map((item) => item.fault),
    );
    return scope.products.map((item, index) => {
      const onlineCount = onlineParts[index] ?? 0;
      const totalDevices = item.total;
      return {
        day: row.day,
        productId: item.productId,
        onlineCount,
        offlineCount: Math.max(0, totalDevices - onlineCount),
        faultCount: faultParts[index] ?? 0,
        totalDevices,
      };
    });
  });

  return {
    startDay,
    endDay,
    productId: query.productId?.trim() || null,
    live: {
      total: scope.total,
      online: scope.online,
      offline: scope.offline,
      fault: scope.fault,
      onlineRate: rate(scope.online, scope.total),
      byProduct: scope.products.map((item) => ({
        productId: item.productId,
        online: item.online,
        offline: item.offline,
        fault: item.fault,
        total: item.total,
      })),
      modeDistribution,
    },
    dailyTrend,
    byProductDaily,
  };
}

export function buildVirtualFaults(query: VirtualRange) {
  const { startDay, endDay, scope } = prepare(query);
  const days = enumerateDays(startDay, endDay);
  const weights = faultWeightsFor(scope.products);
  const dailyBase = Math.max(1, scaleCount(8, scope.total, VIRTUAL_FLEET_TOTAL));
  const dailyAmp = Math.max(1, scaleCount(2, scope.total, VIRTUAL_FLEET_TOTAL));
  const openBase = Math.max(4, scaleCount(54, scope.fault, FLEET_FAULT));
  const dailyTrend = days.map((day, index) => ({
    day,
    newCount: Math.max(1, dailyBase + signed(index, dailyAmp)),
    closedCount: Math.max(1, dailyBase + signed(index, dailyAmp, 3)),
    openCount: Math.max(1, openBase + signed(index, Math.max(1, Math.round(openBase * 0.06)), 1)),
  }));
  const intervalNew = dailyTrend.reduce((sum, row) => sum + row.newCount, 0);
  const newParts = allocate(
    intervalNew,
    weights.map((row) => row.weight),
  );
  const correlation = weights
    .map((row, index) => ({
      productId: row.productId,
      faultCode: row.faultCode,
      newCount: newParts[index] ?? 0,
      liveFaultDevices: row.live,
    }))
    .filter((row) => row.newCount > 0 || row.liveFaultDevices > 0)
    .sort((a, b) => {
      if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1;
      return b.newCount - a.newCount || a.faultCode.localeCompare(b.faultCode);
    });

  const locationParts = allocate(
    scope.fault,
    FAULT_LOCATION_WEIGHTS.map(([, weight]) => weight),
  );
  const survey = surveyFor(scope);
  const openAlerts = scaleCount(OPEN_ALERTS, scope.fault, FLEET_FAULT);
  const pendingDeviceCount = scaleCount(PENDING_DEVICES, scope.fault, FLEET_FAULT);

  return {
    startDay,
    endDay,
    productId: query.productId?.trim() || null,
    kpis: {
      faultDevicesNow: scope.fault,
      openAlerts,
      avgMttrMinutes: AVG_DURATION_MINUTES,
      avgDurationMinutes: AVG_DURATION_MINUTES,
      qualityFaultDevices: scope.fault,
      inServiceDevices: scope.total,
      qualityFaultRate: rate(scope.fault, scope.total),
      pendingDeviceCount,
      surveyFault: scope.fault,
    },
    dailyTrend,
    faultCodeHistogram: summarizeFaultCodesByProduct(
      correlation.map((row) => ({
        productId: row.productId,
        faultCode: row.faultCode,
        newCount: row.newCount,
      })),
    ),
    correlation,
    byLocation: FAULT_LOCATION_WEIGHTS.map(([location], index) => ({
      location,
      count: locationParts[index] ?? 0,
    })).filter((row) => row.count > 0),
    survey,
    liveSurvey: liveSurveyFor(survey),
    warnings: [] as string[],
  };
}

export function buildVirtualUsers(query: VirtualRange) {
  const { startDay, endDay, scope } = prepare(query);
  const dash = buildVirtualDashboard(query);
  const fraction = scope.total / VIRTUAL_FLEET_TOTAL;
  const endUsers = Math.max(1, Math.round(END_USERS * fraction));
  const bindings = {
    zero: 0,
    one: 0,
    two: 0,
    threePlus: 0,
  };
  const bindingParts = allocate(endUsers, [
    BINDING.zero,
    BINDING.one,
    BINDING.two,
    BINDING.threePlus,
  ]);
  bindings.zero = bindingParts[0] ?? 0;
  bindings.one = bindingParts[1] ?? 0;
  bindings.two = bindingParts[2] ?? 0;
  bindings.threePlus = bindingParts[3] ?? 0;
  const boundUserCount = bindings.one + bindings.two + bindings.threePlus;
  const countryParts = allocate(
    endUsers,
    COUNTRIES.map(([, weight]) => weight),
  );

  return {
    startDay,
    endDay,
    productId: query.productId?.trim() || null,
    star: {
      register: dash.series.register,
      control: dash.series.control,
      locations: dash.locations,
      kpis: {
        registerTotal: dash.kpis.registerTotal,
        registerNew: dash.kpis.registerNew,
        controlTotal: dash.kpis.controlTotal,
        controlUsers: dash.kpis.controlUsers,
      },
    },
    local: {
      endUserTotal: endUsers,
      boundUserCount,
      boundUserRate: rate(boundUserCount, endUsers),
      bindingDistribution: bindings,
      countryCodeDistribution: COUNTRIES.map(([countryCode], index) => ({
        countryCode,
        count: countryParts[index] ?? 0,
      })).filter((row) => row.count > 0),
    },
    warnings: [] as string[],
  };
}

function prepare(query: VirtualRange) {
  const startDay = normalizeDay(query.startDay);
  const endDay = normalizeDay(query.endDay);
  return { startDay, endDay, scope: scopeProducts(query.productId) };
}

function scopeProducts(productId?: string): {
  products: ProductSlice[];
  total: number;
  online: number;
  offline: number;
  fault: number;
} {
  const id = productId?.trim();
  let products = PRODUCTS;
  if (id) {
    const found = PRODUCTS.find((item) => item.productId === id);
    products = found
      ? [found]
      : [{ productId: id, total: 1860, online: 1788, offline: 72, fault: 24 }];
  }
  return {
    products,
    total: products.reduce((sum, item) => sum + item.total, 0),
    online: products.reduce((sum, item) => sum + item.online, 0),
    offline: products.reduce((sum, item) => sum + item.offline, 0),
    fault: products.reduce((sum, item) => sum + item.fault, 0),
  };
}

function faultWeightsFor(products: ProductSlice[]): FaultWeight[] {
  const ids = new Set(products.map((item) => item.productId));
  const known = FAULT_WEIGHTS.filter((row) => ids.has(row.productId));
  if (known.length > 0) return known;
  const only = products[0];
  if (!only) return [];
  return [
    { productId: only.productId, faultCode: 'E1', weight: 16, live: Math.max(1, only.fault - 8) },
    { productId: only.productId, faultCode: 'E4', weight: 9, live: Math.min(8, only.fault) },
  ];
}

function surveyFor(scope: {
  total: number;
  online: number;
  offline: number;
  fault: number;
}): TuyaDevicesDatasSurvey {
  return {
    deviceTotal: scope.total,
    deviceOnline: scope.online,
    deviceOffline: scope.offline,
    deviceActive: Math.round(scope.online * 0.72),
    deviceFault: scope.fault,
    raw: { virtual: true },
  };
}

function liveSurveyFor(survey: TuyaDevicesDatasSurvey): TuyaDevicesLiveDatasSurvey {
  return {
    deviceOnline: survey.deviceOnline,
    deviceOffline: survey.deviceOffline,
    deviceActive: survey.deviceActive,
    deviceFault: survey.deviceFault,
    raw: { virtual: true, live: true },
  };
}

function locationItems(total: number): TuyaLocationActivePoint[] {
  const parts = allocate(
    total,
    LOCATION_WEIGHTS.map(([, weight]) => weight),
  );
  return LOCATION_WEIGHTS.map(([name], index) => {
    const value = parts[index] ?? 0;
    return { name, value, percentage: percentage(value, total) };
  }).filter((row) => row.value > 0);
}

function locationDateType(days: number): TuyaLocationDateType {
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  if (days <= 14) return 'weeks';
  return 'month';
}

function activationBase(total: number): number {
  return Math.max(4, Math.round(total * 0.00112));
}

function activationAmp(total: number): number {
  return Math.max(1, Math.round(activationBase(total) * 0.2));
}

function enumerateDays(startDay: string, endDay: string): string[] {
  const start = parseYmd(startDay);
  const end = parseYmd(endDay);
  const out: string[] = [];
  for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
    out.push(formatYmd(new Date(time)));
  }
  return out.length > 0 ? out : [startDay];
}

function normalizeDay(raw: string): string {
  const value = String(raw ?? '')
    .trim()
    .replace(/-/g, '');
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`非法日期：${raw}（需要 YYYYMMDD 或 YYYY-MM-DD）`);
  }
  return value;
}

function parseYmd(ymd: string): Date {
  return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
}

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function wave(index: number, phase = 0): number {
  return Math.sin(((index + phase) / 7) * Math.PI * 2);
}

function signed(index: number, amplitude: number, phase = 0): number {
  return Math.round(amplitude * wave(index, phase));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rate(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number((part / total).toFixed(4));
}

function percentage(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((value / total) * 100).toFixed(2)}%`;
}

function scaleCount(count: number, part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  if (part === whole) return count;
  return Math.max(0, Math.round((count * part) / whole));
}

/** 最大余额法，保证拆分之后相加仍等于 total。 */
export function allocate(total: number, weights: number[]): number[] {
  if (weights.length === 0 || total <= 0) return weights.map(() => 0);
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / sum);
  const floors = exact.map((value) => Math.floor(value));
  let leftover = total - floors.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - (floors[index] ?? 0) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const item of order) {
    if (leftover <= 0) break;
    floors[item.index] = (floors[item.index] ?? 0) + 1;
    leftover -= 1;
  }
  return floors;
}
