import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AlertStatus,
  DeviceFaultStatus,
  DeviceOnlineStatus,
  OpsReportStatus,
  OpsReportTemplate,
  Prisma,
} from '@prisma/client';
import { presentLocationText } from '../devices/china-admin';
import { PrismaService } from '../prisma/prisma.service';
import {
  TUYA_CLIENT,
  TuyaClient,
  TuyaControlStatPoint,
  TuyaDeviceStatPoint,
  TuyaDevicesDatasSurvey,
  TuyaLocationActivePoint,
  TuyaLocationDateType,
  TuyaRegisterStatPoint,
} from '../tuya/tuya.client';
import { summarizeFaultCodesByProduct } from './fault-code-breakdown';
import { extractModeLabel } from './rollup.job';
import {
  AnalyticsDataMeta,
  AnalyticsDataSource,
  isTrialQuotaExhausted,
  TrialQuotaGate,
  TUYA_TRIAL_QUOTA_EXHAUSTED_CODE,
} from './trial-quota';
import {
  buildVirtualDashboard,
  buildVirtualDevicesUsage,
  buildVirtualFaults,
  buildVirtualUsers,
} from './virtual-fleet';

const CACHE_TTL_MS = 8 * 60 * 1000;
const FLEET_PRODUCT_ID = '';

export type DashboardQuery = {
  startDay: string;
  endDay: string;
  productId?: string;
  refresh?: boolean;
  /** virtual 直接返回演示数据；live 或省略则走涂鸦，额度耗尽时降级。 */
  dataSource?: AnalyticsDataSource;
  /** 手动切回真实时绕过冷却，只探测一次。 */
  probe?: boolean;
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
  dataMode: AnalyticsDataMeta['dataMode'];
  virtual: boolean;
  quotaExhausted: boolean;
  virtualReason: AnalyticsDataMeta['virtualReason'];
};

export type DayRangeQuery = {
  startDay: string;
  endDay: string;
  productId?: string;
  dataSource?: AnalyticsDataSource;
  probe?: boolean;
};

export type CreateReportInput = {
  template: 'week' | 'month' | 'custom';
  startDay: string;
  endDay: string;
  productId?: string;
  sections: string[];
  createdByAdminUserId: string;
  name?: string;
};

type CacheEntry = { expiresAt: number; payload: DashboardResponse };

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly quota = new TrialQuotaGate();

  constructor(
    @Inject(TUYA_CLIENT) private readonly tuya: TuyaClient,
    private readonly prisma: PrismaService,
  ) {}

  async getDashboard(query: DashboardQuery): Promise<DashboardResponse> {
    const startDay = normalizeDay(query.startDay);
    const endDay = normalizeDay(query.endDay);
    assertDayRange(startDay, endDay);

    const productId = query.productId?.trim() || undefined;
    const range = { startDay, endDay, productId };
    if (query.dataSource === 'virtual') {
      return { ...buildVirtualDashboard(range), ...this.requestedVirtualMeta() };
    }

    const cacheKey = `${startDay}:${endDay}:${productId ?? ''}`;

    if (!query.refresh) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return { ...hit.payload, fromCache: true };
      }
    }

    if (this.quota.isExhausted() && !query.probe) {
      return { ...buildVirtualDashboard(range), ...this.fallbackVirtualMeta() };
    }

    const warnings: string[] = [];
    try {
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

      this.quota.markClear();
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
        ...this.liveMeta(),
      };

      this.cache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        payload: { ...payload, fromCache: false },
      });

      return payload;
    } catch (err) {
      if (!isTrialQuotaExhausted(err)) throw err;
      this.noteQuotaExhausted(err);
      return { ...buildVirtualDashboard(range), ...this.fallbackVirtualMeta() };
    }
  }

  async getFaultSurvey(productId?: string): Promise<{
    survey: TuyaDevicesDatasSurvey | null;
    live: Awaited<ReturnType<TuyaClient['getDevicesLiveDatasSurvey']>> | null;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const pid = productId?.trim() || undefined;
    const [survey, live] = await Promise.all([
      this.tuya.getDevicesDatasSurvey({ productId: pid }).catch((err) => {
        warnings.push(
          `datas-survey 不可用：${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }),
      this.tuya.getDevicesLiveDatasSurvey({ productId: pid }).catch((err) => {
        warnings.push(
          `live-datas-survey 不可用：${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }),
    ]);
    return { survey, live, warnings };
  }

  async getFaults(query: DayRangeQuery) {
    const startDay = normalizeDay(query.startDay);
    const endDay = normalizeDay(query.endDay);
    assertDayRange(startDay, endDay);
    const productId = query.productId?.trim() || undefined;
    const range = { startDay, endDay, productId };
    if (query.dataSource === 'virtual') {
      return { ...buildVirtualFaults(range), ...this.requestedVirtualMeta() };
    }
    if (this.quota.isExhausted() && !query.probe) {
      return { ...buildVirtualFaults(range), ...this.fallbackVirtualMeta() };
    }

    const rollupProductId = productId ?? FLEET_PRODUCT_ID;

    const deviceWhere: Prisma.DeviceWhereInput = productId
      ? { productId }
      : {};
    const alertWhere: Prisma.AlertWhereInput = productId
      ? { device: { productId } }
      : {};

    const rangeStart = ymdToDate(startDay);
    const rangeEndExclusive = ymdToDate(endDay);
    rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);
    const faultAlertWhere: Prisma.AlertWhereInput = {
      ...alertWhere,
      category: 'fault',
    };

    const [faultDevicesNow, openAlerts, closedWithDuration, daily, devicesForCorr, surveyPack, inServiceDevices, qualityFaultRows, pendingFaultRows] =
      await Promise.all([
        this.prisma.device.count({
          where: { ...deviceWhere, faultStatus: DeviceFaultStatus.fault },
        }),
        this.prisma.alert.count({
          where: { ...alertWhere, status: { not: AlertStatus.closed } },
        }),
        this.prisma.alert.findMany({
          where: {
            ...faultAlertWhere,
            status: AlertStatus.closed,
            closedAt: { gte: rangeStart, lt: rangeEndExclusive },
          },
          select: { openedAt: true, closedAt: true, conditionStartedAt: true },
          take: 5000,
        }),
        this.prisma.dailyFaultStat.findMany({
          where: {
            day: { gte: startDay, lte: endDay },
            productId: rollupProductId,
          },
          orderBy: [{ day: 'asc' }, { faultCode: 'asc' }],
        }),
        this.prisma.device.findMany({
          where: { ...deviceWhere, faultStatus: DeviceFaultStatus.fault },
          select: { productId: true, faultInfo: true, locationText: true, lat: true, lon: true },
        }),
        this.getFaultSurvey(productId),
        this.prisma.device.count({ where: deviceWhere }),
        this.prisma.alert.findMany({
          where: {
            ...faultAlertWhere,
            openedAt: { lt: rangeEndExclusive },
            OR: [{ closedAt: null }, { closedAt: { gte: rangeStart } }],
          },
          select: { deviceId: true },
          distinct: ['deviceId'],
        }),
        this.prisma.alert.findMany({
          where: {
            ...faultAlertWhere,
            status: { not: AlertStatus.closed },
          },
          select: { deviceId: true },
          distinct: ['deviceId'],
        }),
      ]);

    const durationSamples = closedWithDuration
      .filter((a) => a.closedAt)
      .map((a) => {
        const start = a.conditionStartedAt ?? a.openedAt;
        return Math.max(0, Math.round((a.closedAt!.getTime() - start.getTime()) / 60000));
      });
    const avgDurationMinutes =
      durationSamples.length > 0
        ? Math.round(durationSamples.reduce((s, n) => s + n, 0) / durationSamples.length)
        : null;
    const qualityFaultDevices = qualityFaultRows.length;
    const pendingDeviceCount = pendingFaultRows.length;
    const qualityFaultRate =
      inServiceDevices > 0
        ? Number((qualityFaultDevices / inServiceDevices).toFixed(4))
        : null;

    const trendByDay = new Map<
      string,
      { day: string; newCount: number; closedCount: number; openCount: number }
    >();
    for (const row of daily) {
      const t = trendByDay.get(row.day) ?? {
        day: row.day,
        newCount: 0,
        closedCount: 0,
        openCount: 0,
      };
      t.newCount += row.newCount;
      t.closedCount += row.closedCount;
      t.openCount += row.openCount;
      trendByDay.set(row.day, t);
    }

    const rollupCorr = await this.prisma.dailyFaultStat.groupBy({
      by: ['productId', 'faultCode'],
      where: {
        day: { gte: startDay, lte: endDay },
        productId: productId ? productId : { not: FLEET_PRODUCT_ID },
      },
      _sum: { newCount: true, openCount: true },
    });

    const correlationMap = new Map<
      string,
      { productId: string; faultCode: string; newCount: number; liveFaultDevices: number }
    >();
    for (const row of rollupCorr) {
      const key = `${row.productId}\0${row.faultCode}`;
      correlationMap.set(key, {
        productId: row.productId,
        faultCode: row.faultCode,
        newCount: row._sum.newCount ?? 0,
        liveFaultDevices: 0,
      });
    }
    for (const d of devicesForCorr) {
      const faultCode = (d.faultInfo?.trim() || 'device_fault').slice(0, 128);
      const key = `${d.productId}\0${faultCode}`;
      const existing = correlationMap.get(key);
      if (existing) {
        existing.liveFaultDevices += 1;
      } else {
        correlationMap.set(key, {
          productId: d.productId,
          faultCode,
          newCount: 0,
          liveFaultDevices: 1,
        });
      }
    }

    const locationMap = new Map<string, number>();
    for (const d of devicesForCorr) {
      const loc = presentLocationText(d.locationText, d.lat, d.lon)?.trim() || 'unknown';
      locationMap.set(loc, (locationMap.get(loc) ?? 0) + 1);
    }

    const result = {
      startDay,
      endDay,
      productId: productId ?? null,
      kpis: {
        faultDevicesNow,
        openAlerts,
        avgMttrMinutes: avgDurationMinutes,
        avgDurationMinutes,
        qualityFaultDevices,
        inServiceDevices,
        qualityFaultRate,
        pendingDeviceCount,
        surveyFault:
          surveyPack.survey?.deviceFault ?? surveyPack.live?.deviceFault ?? null,
      },
      dailyTrend: [...trendByDay.values()],
      faultCodeHistogram: summarizeFaultCodesByProduct(
        rollupCorr.map((row) => ({
          productId: row.productId,
          faultCode: row.faultCode,
          newCount: row._sum.newCount ?? 0,
        })),
      ),
      correlation: [...correlationMap.values()]
        .filter((row) => row.newCount > 0 || row.liveFaultDevices > 0)
        .sort((a, b) => {
          if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1;
          return b.newCount - a.newCount || a.faultCode.localeCompare(b.faultCode);
        }),
      byLocation: [...locationMap.entries()]
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count),
      survey: surveyPack.survey,
      liveSurvey: surveyPack.live,
      warnings: surveyPack.warnings,
    };
    if (result.warnings.some((warning) => isTrialQuotaExhausted(warning))) {
      this.noteQuotaExhausted(result.warnings.join(' | '));
      return { ...buildVirtualFaults(range), ...this.fallbackVirtualMeta() };
    }
    return { ...result, ...this.liveMeta() };
  }

  async getDevicesUsage(query: DayRangeQuery) {
    const startDay = normalizeDay(query.startDay);
    const endDay = normalizeDay(query.endDay);
    assertDayRange(startDay, endDay);
    const productId = query.productId?.trim() || undefined;
    const range = { startDay, endDay, productId };
    if (query.dataSource === 'virtual') {
      return { ...buildVirtualDevicesUsage(range), ...this.requestedVirtualMeta() };
    }
    if (this.quota.isExhausted() && !query.probe) {
      return { ...buildVirtualDevicesUsage(range), ...this.fallbackVirtualMeta() };
    }
    if (!this.quota.isClearFresh()) {
      const blocked = await this.probeQuota();
      if (blocked) {
        return { ...buildVirtualDevicesUsage(range), ...this.fallbackVirtualMeta() };
      }
    }

    const rollupProductId = productId ?? FLEET_PRODUCT_ID;

    const deviceWhere: Prisma.DeviceWhereInput = productId ? { productId } : {};

    const [liveDevices, dailyFleet, dailyByProduct] = await Promise.all([
      this.prisma.device.findMany({
        where: deviceWhere,
        select: {
          productId: true,
          onlineStatus: true,
          faultStatus: true,
          statusJson: true,
        },
      }),
      this.prisma.dailyDeviceMetric.findMany({
        where: {
          day: { gte: startDay, lte: endDay },
          productId: rollupProductId,
        },
        orderBy: { day: 'asc' },
      }),
      this.prisma.dailyDeviceMetric.findMany({
        where: {
          day: { gte: startDay, lte: endDay },
          productId: productId ? productId : { not: FLEET_PRODUCT_ID },
        },
        orderBy: [{ day: 'asc' }, { productId: 'asc' }],
      }),
    ]);

    let online = 0;
    let offline = 0;
    let fault = 0;
    const byProductLive = new Map<
      string,
      { productId: string; online: number; offline: number; fault: number; total: number }
    >();
    const modeCounts: Record<string, number> = {};

    for (const d of liveDevices) {
      const bucket = byProductLive.get(d.productId) ?? {
        productId: d.productId,
        online: 0,
        offline: 0,
        fault: 0,
        total: 0,
      };
      bucket.total += 1;
      if (d.onlineStatus === DeviceOnlineStatus.online) {
        online += 1;
        bucket.online += 1;
      } else if (d.onlineStatus === DeviceOnlineStatus.offline) {
        offline += 1;
        bucket.offline += 1;
      }
      if (d.faultStatus === DeviceFaultStatus.fault) {
        fault += 1;
        bucket.fault += 1;
      }
      byProductLive.set(d.productId, bucket);

      const mode = extractModeLabel(d.statusJson);
      if (mode) modeCounts[mode] = (modeCounts[mode] ?? 0) + 1;
    }

    const total = liveDevices.length;
    const onlineRate = total > 0 ? Number((online / total).toFixed(4)) : 0;

    // Prefer latest rollup modeCounts when live parse is empty.
    const latestRollup = dailyFleet[dailyFleet.length - 1];
    const rollupModes =
      latestRollup?.modeCounts &&
      typeof latestRollup.modeCounts === 'object' &&
      !Array.isArray(latestRollup.modeCounts)
        ? (latestRollup.modeCounts as Record<string, number>)
        : {};
    const modes =
      Object.keys(modeCounts).length > 0
        ? modeCounts
        : rollupModes;

    return {
      startDay,
      endDay,
      productId: productId ?? null,
      live: {
        total,
        online,
        offline,
        fault,
        onlineRate,
        byProduct: [...byProductLive.values()].sort((a, b) => b.total - a.total),
        modeDistribution: Object.entries(modes)
          .map(([mode, count]) => ({ mode, count }))
          .sort((a, b) => b.count - a.count),
      },
      dailyTrend: dailyFleet.map((row) => ({
        day: row.day,
        onlineCount: row.onlineCount,
        offlineCount: row.offlineCount,
        faultCount: row.faultCount,
        totalDevices: row.totalDevices,
        onlineRate:
          row.totalDevices > 0
            ? Number((row.onlineCount / row.totalDevices).toFixed(4))
            : 0,
      })),
      byProductDaily: dailyByProduct.map((row) => ({
        day: row.day,
        productId: row.productId,
        onlineCount: row.onlineCount,
        offlineCount: row.offlineCount,
        faultCount: row.faultCount,
        totalDevices: row.totalDevices,
      })),
      ...this.liveMeta(),
    };
  }

  async getUsersInsights(query: DayRangeQuery) {
    const startDay = normalizeDay(query.startDay);
    const endDay = normalizeDay(query.endDay);
    assertDayRange(startDay, endDay);
    const range = {
      startDay,
      endDay,
      productId: query.productId?.trim() || undefined,
    };
    if (query.dataSource === 'virtual') {
      return { ...buildVirtualUsers(range), ...this.requestedVirtualMeta() };
    }
    if (this.quota.isExhausted() && !query.probe) {
      return { ...buildVirtualUsers(range), ...this.fallbackVirtualMeta() };
    }

    const warnings: string[] = [];
    const [register, control, locations, endUsers] = await Promise.all([
      this.tuya.getAppUserRegisterStat({ startDay, endDay }).catch((err) => {
        warnings.push(`注册星象仪不可用：${err instanceof Error ? err.message : String(err)}`);
        return [] as TuyaRegisterStatPoint[];
      }),
      this.tuya
        .getAppDeviceControl({
          startDay,
          endDay,
          productId: query.productId?.trim() || undefined,
        })
        .catch((err) => {
          warnings.push(`控制星象仪不可用：${err instanceof Error ? err.message : String(err)}`);
          return [] as TuyaControlStatPoint[];
        }),
      this.fetchLocations(
        startDay,
        endDay,
        query.productId?.trim() || undefined,
        warnings,
      ),
      this.prisma.endUser.findMany({
        select: {
          id: true,
          countryCode: true,
          _count: { select: { bindings: true } },
        },
      }),
    ]);

    const bindingBuckets = { zero: 0, one: 0, two: 0, threePlus: 0 };
    const countryMap = new Map<string, number>();
    for (const u of endUsers) {
      const n = u._count.bindings;
      if (n <= 0) bindingBuckets.zero += 1;
      else if (n === 1) bindingBuckets.one += 1;
      else if (n === 2) bindingBuckets.two += 1;
      else bindingBuckets.threePlus += 1;

      const cc = u.countryCode?.trim() || 'unknown';
      countryMap.set(cc, (countryMap.get(cc) ?? 0) + 1);
    }

    const lastRegister = register[register.length - 1];
    if (warnings.some((warning) => isTrialQuotaExhausted(warning))) {
      this.noteQuotaExhausted(warnings.join(' | '));
      return { ...buildVirtualUsers(range), ...this.fallbackVirtualMeta() };
    }
    if (warnings.length === 0) this.quota.markClear();
    return {
      startDay,
      endDay,
      productId: query.productId?.trim() || null,
      star: {
        register,
        control,
        locations,
        kpis: {
          registerTotal: lastRegister?.totalRegisterNum ?? 0,
          registerNew: register.reduce((s, r) => s + r.todayRegisterNum, 0),
          controlTotal: control.reduce((s, r) => s + r.controlNum, 0),
          controlUsers: control.reduce((s, r) => s + r.controlUserNum, 0),
        },
      },
      local: {
        endUserTotal: endUsers.length,
        boundUserCount: bindingBuckets.one + bindingBuckets.two + bindingBuckets.threePlus,
        boundUserRate:
          endUsers.length > 0
            ? Number(
                (
                  (bindingBuckets.one + bindingBuckets.two + bindingBuckets.threePlus) /
                  endUsers.length
                ).toFixed(4),
              )
            : null,
        bindingDistribution: bindingBuckets,
        countryCodeDistribution: [...countryMap.entries()]
          .map(([countryCode, count]) => ({ countryCode, count }))
          .sort((a, b) => b.count - a.count),
      },
      warnings,
      ...this.liveMeta(),
    };
  }

  async createReport(input: CreateReportInput) {
    const startDay = normalizeDay(input.startDay);
    const endDay = normalizeDay(input.endDay);
    assertDayRange(startDay, endDay);
    const productId = input.productId?.trim() || undefined;
    const sections = Array.isArray(input.sections)
      ? input.sections.map((s) => String(s).trim()).filter(Boolean)
      : [];
    if (sections.length === 0) {
      throw new Error('sections 不能为空');
    }

    const template = normalizeReportTemplate(input.template);
    const name =
      input.name?.trim() ||
      `ops-${template}-${startDay}-${endDay}${productId ? `-${productId}` : ''}`;

    const report = await this.prisma.opsReport.create({
      data: {
        name,
        template,
        startDay,
        endDay,
        productId: productId ?? null,
        sections,
        status: OpsReportStatus.pending,
        createdByAdminUserId: input.createdByAdminUserId,
      },
    });

    try {
      const range: DayRangeQuery = { startDay, endDay, productId };
      const result: Record<string, unknown> = {
        startDay,
        endDay,
        productId: productId ?? null,
        template,
        generatedAt: new Date().toISOString(),
      };

      if (sections.includes('faults') || sections.includes('all')) {
        result.faults = await this.getFaults(range);
      }
      if (sections.includes('devices') || sections.includes('devices-usage') || sections.includes('all')) {
        result.devicesUsage = await this.getDevicesUsage(range);
      }
      if (sections.includes('users') || sections.includes('users-insights') || sections.includes('all')) {
        result.usersInsights = await this.getUsersInsights(range);
      }
      if (sections.includes('dashboard') || sections.includes('all')) {
        result.dashboard = await this.getDashboard(range);
      }

      const csvText = buildReportCsv(result, sections);

      return await this.prisma.opsReport.update({
        where: { id: report.id },
        data: {
          status: OpsReportStatus.ready,
          resultJson: result as Prisma.InputJsonValue,
          csvText,
          completedAt: new Date(),
          error: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`OpsReport ${report.id} failed: ${message}`);
      return await this.prisma.opsReport.update({
        where: { id: report.id },
        data: {
          status: OpsReportStatus.failed,
          error: message.slice(0, 1000),
          completedAt: new Date(),
        },
      });
    }
  }

  async listReports(limit = 50) {
    return this.prisma.opsReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        name: true,
        template: true,
        startDay: true,
        endDay: true,
        productId: true,
        sections: true,
        status: true,
        error: true,
        createdByAdminUserId: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }

  async getReport(id: string) {
    const report = await this.prisma.opsReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException(`报告不存在：${id}`);
    }
    return report;
  }

  private liveMeta(): AnalyticsDataMeta {
    return {
      dataMode: 'live',
      virtual: false,
      quotaExhausted: false,
      virtualReason: null,
    };
  }

  private requestedVirtualMeta(): AnalyticsDataMeta {
    return {
      dataMode: 'virtual',
      virtual: true,
      quotaExhausted: this.quota.isExhausted(),
      virtualReason: 'requested',
    };
  }

  private fallbackVirtualMeta(): AnalyticsDataMeta {
    return {
      dataMode: 'virtual',
      virtual: true,
      quotaExhausted: true,
      virtualReason: 'quota-fallback',
    };
  }

  private noteQuotaExhausted(err: unknown): void {
    const firstSight = !this.quota.isExhausted();
    this.quota.markExhausted();
    if (!firstSight) return;
    const text = err instanceof Error ? err.message : String(err);
    this.logger.warn(
      `IoT Core trial quota exhausted (${TUYA_TRIAL_QUOTA_EXHAUSTED_CODE}); serving virtual analytics during cooldown. ${text}`,
    );
  }

  /** 设备分析不走星象仪。额度未知时探测一次 getAppDeviceStat，耗尽后进入冷却不再打。 */
  private async probeQuota(): Promise<boolean> {
    const day = formatProbeDay(new Date());
    try {
      await this.tuya.getAppDeviceStat({ startDay: day, endDay: day });
      this.quota.markClear();
      return false;
    } catch (err) {
      if (!isTrialQuotaExhausted(err)) return false;
      this.noteQuotaExhausted(err);
      return true;
    }
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

function formatProbeDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function ymdToDate(ymd: string): Date {
  return new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)),
  );
}

function normalizeReportTemplate(raw: string): OpsReportTemplate {
  if (raw === 'week' || raw === 'month' || raw === 'custom') {
    return raw as OpsReportTemplate;
  }
  throw new Error(`非法 template：${raw}（需要 week|month|custom）`);
}

function buildReportCsv(result: Record<string, unknown>, sections: string[]): string {
  const lines: string[] = ['section,key,value'];
  lines.push(`meta,startDay,${csvEscape(String(result.startDay ?? ''))}`);
  lines.push(`meta,endDay,${csvEscape(String(result.endDay ?? ''))}`);
  lines.push(`meta,productId,${csvEscape(String(result.productId ?? ''))}`);
  lines.push(`meta,sections,${csvEscape(sections.join('|'))}`);

  const faults = result.faults as
    | {
        kpis?: Record<string, unknown>;
        dailyTrend?: Array<Record<string, unknown>>;
        faultCodeHistogram?: Array<{ productId: string; faultCode: string; count: number }>;
      }
    | undefined;
  if (faults?.kpis) {
    const kpis = faults.kpis;
    lines.push(
      `faults.kpi,质量故障率,${csvEscape(String(kpis.qualityFaultRate ?? ''))}`,
    );
    lines.push(
      `faults.kpi,质量故障设备数,${csvEscape(String(kpis.qualityFaultDevices ?? ''))}`,
    );
    lines.push(`faults.kpi,在网设备数,${csvEscape(String(kpis.inServiceDevices ?? ''))}`);
    lines.push(`faults.kpi,待处理台数,${csvEscape(String(kpis.pendingDeviceCount ?? ''))}`);
    lines.push(
      `faults.kpi,平均持续时长分钟,${csvEscape(String(kpis.avgDurationMinutes ?? ''))}`,
    );
  }
  if (faults?.faultCodeHistogram) {
    for (const row of faults.faultCodeHistogram) {
      lines.push(
        `faults.histogram,${csvEscape(`${row.productId}/${row.faultCode}`)},${csvEscape(String(row.count))}`,
      );
    }
  }

  const devices = result.devicesUsage as
    | {
        live?: {
          onlineRate?: number;
          total?: number;
          online?: number;
          offline?: number;
          fault?: number;
          modeDistribution?: Array<{ mode: string; count: number }>;
        };
      }
    | undefined;
  if (devices?.live) {
    lines.push(
      `devices.live,当前快照在线率,${csvEscape(String(devices.live.onlineRate ?? ''))}`,
    );
    lines.push(`devices.live,纳管设备,${csvEscape(String(devices.live.total ?? ''))}`);
    lines.push(`devices.live,在线,${csvEscape(String(devices.live.online ?? ''))}`);
    lines.push(`devices.live,离线,${csvEscape(String(devices.live.offline ?? ''))}`);
    lines.push(`devices.live,故障设备,${csvEscape(String(devices.live.fault ?? ''))}`);
    for (const row of devices.live.modeDistribution ?? []) {
      lines.push(`devices.mode,${csvEscape(row.mode)},${csvEscape(String(row.count))}`);
    }
  }

  const users = result.usersInsights as
    | {
        local?: {
          endUserTotal?: number;
          boundUserCount?: number;
          boundUserRate?: number | null;
          bindingDistribution?: Record<string, number>;
          countryCodeDistribution?: Array<{ countryCode: string; count: number }>;
        };
        star?: { kpis?: Record<string, unknown> };
      }
    | undefined;
  if (users?.star?.kpis) {
    const star = users.star.kpis;
    lines.push(`users.star,来源,涂鸦数据星象仪`);
    lines.push(`users.star,累计注册,${csvEscape(String(star.registerTotal ?? ''))}`);
    lines.push(`users.star,区间新增注册,${csvEscape(String(star.registerNew ?? ''))}`);
    lines.push(`users.star,区间控制次数,${csvEscape(String(star.controlTotal ?? ''))}`);
    lines.push(`users.star,控制用户,${csvEscape(String(star.controlUsers ?? ''))}`);
  }
  if (users?.local) {
    lines.push(
      `users.local,本地已同步用户,${csvEscape(String(users.local.endUserTotal ?? 0))}`,
    );
    lines.push(
      `users.local,有绑定的用户数,${csvEscape(String(users.local.boundUserCount ?? ''))}`,
    );
    lines.push(
      `users.local,有绑定的用户占比,${csvEscape(String(users.local.boundUserRate ?? ''))}`,
    );
    for (const [k, v] of Object.entries(users.local.bindingDistribution ?? {})) {
      lines.push(`users.bindings,${csvEscape(k)},${csvEscape(String(v))}`);
    }
    for (const row of users.local.countryCodeDistribution ?? []) {
      lines.push(
        `users.country,${csvEscape(row.countryCode)},${csvEscape(String(row.count))}`,
      );
    }
  }

  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
