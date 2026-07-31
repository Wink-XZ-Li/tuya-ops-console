import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TUYA_CLIENT,
  TuyaClient,
  TuyaControlStatPoint,
  TuyaDeviceStatPoint,
  TuyaLocationActivePoint,
  TuyaLocationDateType,
  TuyaRegisterStatPoint,
} from '../tuya/tuya.client';

const CACHE_TTL_MS = 8 * 60 * 1000;

export type DashboardQuery = {
  startDay: string;
  endDay: string;
  productId?: string;
  refresh?: boolean;
};

export type DashboardResponse = {
  startDay: string;
  endDay: string;
  productId: string | null;
  cachedAt: string;
  fromCache: boolean;
  note: string;
  kpis: {
    activationTotal: number;
    activationNew: number;
    activeLatest: number;
    registerTotal: number;
    registerNew: number;
    controlTotal: number;
    controlUsers: number;
  };
  series: {
    device: TuyaDeviceStatPoint[];
    register: TuyaRegisterStatPoint[];
    control: TuyaControlStatPoint[];
  };
  locations: {
    dateType: TuyaLocationDateType;
    items: TuyaLocationActivePoint[];
  };
  warnings: string[];
};

type CacheEntry = { expiresAt: number; payload: DashboardResponse };

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@Inject(TUYA_CLIENT) private readonly tuya: TuyaClient) {}

  async getDashboard(query: DashboardQuery): Promise<DashboardResponse> {
    const startDay = normalizeDay(query.startDay);
    const endDay = normalizeDay(query.endDay);
    assertDayRange(startDay, endDay);

    const productId = query.productId?.trim() || undefined;
    const cacheKey = `${startDay}:${endDay}:${productId ?? ''}`;

    if (!query.refresh) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return { ...hit.payload, fromCache: true };
      }
    }

    const warnings: string[] = [];
    const [device, register, control, locations] = await Promise.all([
      this.tuya.getAppDeviceStat({ startDay, endDay, productId }),
      this.tuya.getAppUserRegisterStat({ startDay, endDay }),
      this.tuya.getAppDeviceControl({ startDay, endDay, productId }).catch((err) => {
        warnings.push(`控制数据不可用：${err instanceof Error ? err.message : String(err)}`);
        return [] as TuyaControlStatPoint[];
      }),
      this.fetchLocations(startDay, endDay, productId, warnings),
    ]);

    const lastDevice = device[device.length - 1];
    const lastRegister = register[register.length - 1];
    const activationNew = device.reduce((sum, row) => sum + row.activationNum, 0);
    const registerNew = register.reduce((sum, row) => sum + row.todayRegisterNum, 0);
    const controlTotal = control.reduce((sum, row) => sum + row.controlNum, 0);
    const controlUsers = control.reduce((sum, row) => sum + row.controlUserNum, 0);

    const payload: DashboardResponse = {
      startDay,
      endDay,
      productId: productId ?? null,
      cachedAt: new Date().toISOString(),
      fromCache: false,
      note: 'App 级数据星象仪指标；与运维台设备白名单无关。按 PID 筛选时，地区分布若无权限会回退到全产品。',
      kpis: {
        activationTotal: lastDevice?.activationTotalNum ?? 0,
        activationNew,
        activeLatest: lastDevice?.activeNum ?? 0,
        registerTotal: lastRegister?.totalRegisterNum ?? 0,
        registerNew,
        controlTotal,
        controlUsers,
      },
      series: { device, register, control },
      locations,
      warnings,
    };

    this.cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload: { ...payload, fromCache: false },
    });

    return payload;
  }

  private async fetchLocations(
    startDay: string,
    endDay: string,
    productId: string | undefined,
    warnings: string[],
  ): Promise<{ dateType: TuyaLocationDateType; items: TuyaLocationActivePoint[] }> {
    const dateType = pickLocationDateType(startDay, endDay);
    try {
      const items = await this.tuya.getLocationsActiveDatas({
        dateType,
        type: 'province',
        limit: 20,
        productId,
      });
      return { dateType, items };
    } catch (err) {
      if (productId) {
        this.logger.warn(
          `locations with productId failed, retrying without: ${err instanceof Error ? err.message : String(err)}`,
        );
        warnings.push('按产品筛选地区分布无权限，已回退为全产品地区分布');
        try {
          const items = await this.tuya.getLocationsActiveDatas({
            dateType,
            type: 'province',
            limit: 20,
          });
          return { dateType, items };
        } catch (err2) {
          warnings.push(
            `地区分布不可用：${err2 instanceof Error ? err2.message : String(err2)}`,
          );
          return { dateType, items: [] };
        }
      }
      warnings.push(`地区分布不可用：${err instanceof Error ? err.message : String(err)}`);
      return { dateType, items: [] };
    }
  }
}

export function normalizeDay(raw: string): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/-/g, '');
  if (!/^\d{8}$/.test(s)) {
    throw new Error(`非法日期：${raw}（需要 YYYYMMDD 或 YYYY-MM-DD）`);
  }
  return s;
}

export function assertDayRange(startDay: string, endDay: string): void {
  if (startDay > endDay) {
    throw new Error('startDay 不能晚于 endDay');
  }
  const start = ymdToDate(startDay);
  const end = ymdToDate(endDay);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days > 90) {
    throw new Error('日期跨度不能超过 90 天');
  }
}

export function pickLocationDateType(startDay: string, endDay: string): TuyaLocationDateType {
  const start = ymdToDate(startDay);
  const end = ymdToDate(endDay);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  if (days <= 14) return 'weeks';
  return 'month';
}

function ymdToDate(ymd: string): Date {
  return new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)),
  );
}
