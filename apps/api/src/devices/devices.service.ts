import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceOnlineStatus, Prisma } from '@prisma/client';
import { alertDurationMinutes } from '../alerts/alerts.service';
import { isDemoFixtureUid } from '../demo/demo-fixtures';
import { PrismaService } from '../prisma/prisma.service';
import { TUYA_CLIENT, TuyaClient } from '../tuya/tuya.client';
import { presentLocationText } from './china-admin';
import {
  asRecord,
  deriveFaultFields,
  deriveSignalStrength,
  statusFromPairs,
} from './device-derived';
import { defaultTrendDps } from './default-trend-dps';
import { getProductDps } from './product-dp-schemas';
import {
  type FaultHistoryRow,
  closedReasonLabel,
  faultDpCode,
  isConnectivityAlert,
  pageFaultHistory,
  pickFaultCopy,
  selectFaultHistory,
  summarizeFaultHistory,
} from './fault-history';
import {
  type TrendBucket,
  TREND_MAX_RANGE_MS,
  TREND_PROPERTY_BIZ_CODES,
  bucketForRange,
  applyDpScale,
  createTrendFold,
  extractDpRawSamples,
  extractDpSamples,
  needsReportCounts,
  resolveDpToken,
  trendCountWindow,
} from './dp-trends';
import {
  buildUsage,
  usageBucketForRange,
  type UsageAnchor,
  type UsageBucket,
  type UsageSample,
} from './usage';
import { usageMetricsForProduct } from './usage-metrics';
import { CONNECTIVITY_BIZ_CODES, buildConnectivityTimeline } from './connectivity';
import { FIRMWARE_BIZ_CODES, buildChangeMarkers } from './change-markers';
import {
  buildStatusTimeline,
  normalizeStatusValue,
  statusBarDpsForProduct,
  statusLabel,
} from './status-bars';
import {
  LOOKBACK_MAX_PAGES,
  LOOKBACK_PAGE_SIZE,
  USAGE_BASELINE_MAX_PAGES,
  bucketKey,
  compareEvents,
  eventHotCutoff,
  forEachEventPage,
  isShortEventWindow,
  longWindowBucketMs,
} from './event-window';

export interface ListDevicesParams {
  q?: string;
  productId?: string;
  onlineStatus?: DeviceOnlineStatus;
  page?: number;
  pageSize?: number;
}

export interface ListDeviceEventsParams {
  bizCode?: string;
  /** Comma-separated bizCodes (IN filter). Takes precedence over bizCode when set. */
  bizCodes?: string;
  /** Comma-separated dpId / code list (OR match on payload). */
  dpId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface FaultHistoryParams {
  from?: string;
  to?: string;
  includeConnectivity?: string;
  cursor?: string;
  focus?: 'open' | 'opened';
}

export interface DpTrendsParams {
  dpIds?: string;
  from?: string;
  to?: string;
  bucket?: TrendBucket;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TUYA_CLIENT) private readonly tuya: TuyaClient,
  ) {}

  async list(params: ListDevicesParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const where: Prisma.DeviceWhereInput = {};

    if (params.productId) {
      where.productId = params.productId;
    }
    if (params.onlineStatus) {
      where.onlineStatus = params.onlineStatus;
    }
    if (params.q) {
      where.OR = [
        { deviceId: { contains: params.q } },
        { name: { contains: params.q } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.device.count({ where }),
    ]);

    return {
      items: items.map((device) => ({
        ...device,
        locationText: presentLocationText(device.locationText, device.lat, device.lon),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getByDeviceId(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      include: {
        bindings: {
          include: {
            endUser: {
              select: {
                tuyaUid: true,
                username: true,
                mobile: true,
                email: true,
                remark: true,
              },
            },
          },
        },
        alerts: {
          where: { status: { not: 'closed' } },
          select: { id: true, title: true },
        },
      },
    });

    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    return this.toDetail(device);
  }

  /** Read-only quality-fault timeline for one device. Does not close alerts. */
  async faultHistory(deviceId: string, query: FaultHistoryParams, now = new Date()) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true, productId: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const from = parseHistoryInstant(query.from, '开始时间');
    const to = parseHistoryInstant(query.to, '结束时间');
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('开始时间不能晚于结束时间');
    }
    const includeConnectivity =
      query.includeConnectivity === '1' || query.includeConnectivity === 'true';
    const focus = query.focus === 'open' || query.focus === 'opened' ? query.focus : undefined;
    const options = { from, to, includeConnectivity, focus };

    const alerts = await this.prisma.alert.findMany({
      where: { deviceId: device.id },
      select: {
        id: true,
        status: true,
        category: true,
        faultCode: true,
        title: true,
        openedAt: true,
        closedAt: true,
        conditionStartedAt: true,
        occurrenceCount: true,
        lastSeenAt: true,
        closedReason: true,
        detail: true,
      },
    });
    const rows = alerts as FaultHistoryRow[];
    const selected = selectFaultHistory(rows, options);
    const page = pageFaultHistory(selected, query.cursor);
    const summary = summarizeFaultHistory(rows, options, now);

    const labels = [
      ...new Set(
        page.items
          .map((alert) => alert.faultCode)
          .filter((code): code is string => Boolean(code)),
      ),
    ];
    const definitions =
      labels.length === 0
        ? []
        : await this.prisma.faultCodeDefinition.findMany({
            where: { productId: device.productId, label: { in: labels } },
            select: { code: true, label: true, symptom: true, suggestedAction: true },
          });

    return {
      items: page.items.map((alert) => {
        const copy = pickFaultCopy(definitions, alert.faultCode, faultDpCode(alert.detail));
        return {
          id: alert.id,
          status: alert.status,
          category: alert.category,
          faultCode: alert.faultCode,
          title: alert.title,
          openedAt: alert.openedAt.toISOString(),
          closedAt: alert.closedAt?.toISOString() ?? null,
          conditionStartedAt: alert.conditionStartedAt?.toISOString() ?? null,
          occurrenceCount: alert.occurrenceCount,
          lastSeenAt: alert.lastSeenAt?.toISOString() ?? null,
          closedReason: alert.closedReason,
          closedReasonLabel: closedReasonLabel(alert.closedReason, alert.status),
          symptom: copy.symptom,
          suggestedAction: copy.suggestedAction,
          durationMinutes: alertDurationMinutes(alert, now),
          connectivity: isConnectivityAlert(alert),
        };
      }),
      summary,
      nextCursor: page.nextCursor,
    };
  }

  /** Numeric DP buckets from stored property events. Empty hours are omitted, not filled with 0. */
  async dpTrends(deviceId: string, query: DpTrendsParams, now = new Date()) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true, productId: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const to = parseHistoryInstant(query.to, '结束时间') ?? now;
    const from = parseHistoryInstant(query.from, '开始时间') ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('开始时间不能晚于结束时间');
    }
    if (to.getTime() - from.getTime() > TREND_MAX_RANGE_MS) {
      throw new BadRequestException('区间不能超过 90 天');
    }

    const schema = getProductDps(device.productId);
    const requested = (query.dpIds ?? '')
      .split(',')
      .map((token) => resolveDpToken(token, schema))
      .filter(Boolean);
    const defaults = defaultTrendDps(device.productId).map((token) => resolveDpToken(token, schema));
    const numericCodes =
      schema.length > 0
        ? new Set(schema.filter((dp) => dp.type === 'value').map((dp) => dp.code))
        : null;
    const bucket = query.bucket ?? bucketForRange(to.getTime() - from.getTime());
    const loadFrom = trendCountWindow(
      from,
      to,
      needsReportCounts(requested, defaults, numericCodes),
    );
    const fold = createTrendFold({ schema, defaults, requested, from, to, bucket });
    const bizCode = { in: [...TREND_PROPERTY_BIZ_CODES] };
    if (isShortEventWindow(loadFrom, to)) {
      fold.add(await this.loadShortEvents(device.id, loadFrom, to, bizCode, { payload: true, eventTime: true }));
    } else {
      await this.scanLongEvents(device.id, loadFrom, to, bizCode, { id: true, payload: true, eventTime: true }, (page) => {
        fold.add(page);
      });
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bucket,
      series: fold.finish(),
    };
  }

  /** Usage bars from cumulative meters. `bucket=hour` for a 24-hour view, `day` otherwise. Empty buckets are omitted. */
  async usage(
    deviceId: string,
    query: { metric?: string; from?: string; to?: string; bucket?: UsageBucket },
    now = new Date(),
  ) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true, productId: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const metric = usageMetricsForProduct(device.productId).find((item) => item.metricId === query.metric);
    if (!metric) {
      throw new BadRequestException('该产品没有这项用量');
    }

    const to = parseHistoryInstant(query.to, '结束时间') ?? now;
    const from = parseHistoryInstant(query.from, '开始时间') ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('开始时间不能晚于结束时间');
    }
    if (to.getTime() - from.getTime() > TREND_MAX_RANGE_MS) {
      throw new BadRequestException('区间不能超过 90 天');
    }
    const bucket = query.bucket ?? usageBucketForRange(to.getTime() - from.getTime());
    const schema = getProductDps(device.productId);
    const bizCode = { in: [...TREND_PROPERTY_BIZ_CODES] };
    const baselinePromise = this.latestUsageSampleBefore(
      device.id,
      from,
      schema,
      metric.sourceDpId,
      metric.scale,
    );
    const samples: UsageSample[] = [];
    const collect = (events: Array<{ payload: unknown; eventTime: Date }>) => {
      for (const event of events) {
        for (const raw of extractDpSamples(event.payload, event.eventTime)) {
          if (resolveDpToken(raw.code, schema) !== metric.sourceDpId) continue;
          samples.push({ t: raw.t, value: applyDpScale(raw.value, metric.scale) });
        }
      }
    };
    if (isShortEventWindow(from, to)) {
      collect(await this.loadShortEvents(device.id, from, to, bizCode, { payload: true, eventTime: true }));
    } else {
      // Keep every sample of this one DP. First/last/dip per day drops the cycle peaks in between.
      await this.scanLongEvents(device.id, from, to, bizCode, { id: true, payload: true, eventTime: true }, (page) => {
        collect(page);
      });
    }
    const baseline = await baselinePromise;

    return {
      metricId: metric.metricId,
      name: metric.name,
      sourceDpId: metric.sourceDpId,
      unit: metric.unit,
      from: from.toISOString(),
      to: to.toISOString(),
      ...buildUsage({
        samples,
        baseline: baseline.sample,
        anchor: baseline.anchor,
        from,
        to,
        mode: metric.mode,
        bucket,
      }),
    };
  }

  /**
   * Online/offline ribbon from DeviceEvent connectivity bizCodes.
   * Offline alerts are not used: they open only after a delay and miss short drops.
   */
  async connectivity(
    deviceId: string,
    query: { from?: string; to?: string },
    now = new Date(),
  ) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const to = parseHistoryInstant(query.to, '结束时间') ?? now;
    const from = parseHistoryInstant(query.from, '开始时间') ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('开始时间不能晚于结束时间');
    }
    if (to.getTime() - from.getTime() > TREND_MAX_RANGE_MS) {
      throw new BadRequestException('区间不能超过 90 天');
    }

    const bizCode = { in: [...CONNECTIVITY_BIZ_CODES] };
    const prior = await this.latestEventBefore(device.id, from, bizCode);
    const points: Array<{ t: number; bizCode: string }> = [];
    if (isShortEventWindow(from, to)) {
      const events = await this.loadShortEvents(device.id, from, to, bizCode, {
        bizCode: true,
        eventTime: true,
      });
      for (const event of events) points.push({ t: event.eventTime.getTime(), bizCode: String(event.bizCode) });
    } else {
      const bucketMs = longWindowBucketMs(from, to);
      const fromMs = from.getTime();
      const kept = new Map<number, { t: number; bizCode: string }>();
      await this.scanLongEvents(
        device.id,
        from,
        to,
        bizCode,
        { id: true, bizCode: true, eventTime: true },
        (page) => {
          for (const event of page) {
            const t = event.eventTime.getTime();
            const key = bucketKey(t, fromMs, bucketMs);
            const prev = kept.get(key);
            if (!prev || t >= prev.t) kept.set(key, { t, bizCode: String(event.bizCode) });
          }
        },
      );
      points.push(...[...kept.values()].sort((a, b) => a.t - b.t));
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      source: 'deviceEvent' as const,
      ...buildConnectivityTimeline({
        from,
        to,
        prior: prior ? { t: prior.eventTime.getTime(), bizCode: prior.bizCode } : null,
        events: points,
      }),
    };
  }

  /**
   * Enum/bool status ribbons from property events.
   * The latest sample of each configured DP before `from` carries that value in.
   */
  async statusBars(
    deviceId: string,
    query: { from?: string; to?: string },
    now = new Date(),
  ) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true, productId: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const to = parseHistoryInstant(query.to, '结束时间') ?? now;
    const from = parseHistoryInstant(query.from, '开始时间') ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('开始时间不能晚于结束时间');
    }
    if (to.getTime() - from.getTime() > TREND_MAX_RANGE_MS) {
      throw new BadRequestException('区间不能超过 90 天');
    }

    const configured = statusBarDpsForProduct(device.productId);
    if (configured.length === 0) {
      return { from: from.toISOString(), to: to.toISOString(), bars: [] };
    }

    const schema = getProductDps(device.productId);
    const byCode = new Map(configured.map((dp) => [dp.dpId, dp]));
    const bizCode = { in: [...TREND_PROPERTY_BIZ_CODES] };
    const prior = new Map<string, { t: number; value: string }>();
    await this.fillStatusPrior(device.id, from, schema, byCode, prior);

    const points = new Map<string, Array<{ t: number; value: string }>>();
    const pushPoint = (code: string, point: { t: number; value: string }) => {
      const list = points.get(code) ?? [];
      list.push(point);
      points.set(code, list);
    };
    if (isShortEventWindow(from, to)) {
      const events = await this.loadShortEvents(device.id, from, to, bizCode, { payload: true, eventTime: true });
      for (const event of events) {
        for (const sample of extractDpRawSamples(event.payload, event.eventTime)) {
          const code = resolveDpToken(sample.code, schema);
          const dp = byCode.get(code);
          if (!dp) continue;
          const value = normalizeStatusValue(dp, sample.value);
          if (!value) continue;
          pushPoint(code, { t: sample.t, value });
        }
      }
    } else {
      const bucketMs = longWindowBucketMs(from, to);
      const fromMs = from.getTime();
      const folded = new Map<string, Map<number, { t: number; value: string }>>();
      await this.scanLongEvents(
        device.id,
        from,
        to,
        bizCode,
        { id: true, payload: true, eventTime: true },
        (page) => {
          for (const event of page) {
            for (const sample of extractDpRawSamples(event.payload, event.eventTime)) {
              const code = resolveDpToken(sample.code, schema);
              const dp = byCode.get(code);
              if (!dp) continue;
              const value = normalizeStatusValue(dp, sample.value);
              if (!value) continue;
              const key = bucketKey(sample.t, fromMs, bucketMs);
              const byBucket = folded.get(code) ?? new Map<number, { t: number; value: string }>();
              const prev = byBucket.get(key);
              if (!prev || sample.t >= prev.t) byBucket.set(key, { t: sample.t, value });
              folded.set(code, byBucket);
            }
          }
        },
      );
      for (const [code, byBucket] of folded) {
        for (const point of [...byBucket.values()].sort((a, b) => a.t - b.t)) pushPoint(code, point);
      }
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bars: configured.map((dp) => ({
        dpId: dp.dpId,
        name: dp.name,
        type: dp.type,
        range: dp.range,
        segments: buildStatusTimeline({
          from,
          to,
          prior: prior.get(dp.dpId) ?? null,
          points: points.get(dp.dpId) ?? [],
          labelOf: (value) => statusLabel(dp, value),
        }),
      })),
    };
  }

  /**
   * Firmware upgrades and successful remote commands inside the chart window.
   * The live upgrade-infos snapshot has no change time, so it is not used.
   */
  async changeMarkers(
    deviceId: string,
    query: { from?: string; to?: string },
    now = new Date(),
  ) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const to = parseHistoryInstant(query.to, '结束时间') ?? now;
    const from = parseHistoryInstant(query.from, '开始时间') ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('开始时间不能晚于结束时间');
    }
    if (to.getTime() - from.getTime() > TREND_MAX_RANGE_MS) {
      throw new BadRequestException('区间不能超过 90 天');
    }

    const [events, commands] = await Promise.all([
      this.prisma.deviceEvent.findMany({
        where: {
          deviceId: device.id,
          eventTime: { gte: from, lte: to },
          bizCode: { in: [...FIRMWARE_BIZ_CODES] },
        },
        orderBy: { eventTime: 'asc' },
        select: { payload: true, eventTime: true },
        take: 500,
      }),
      this.prisma.commandLog.findMany({
        where: { deviceId: device.id, success: true, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
        select: { code: true, value: true, createdAt: true },
        take: 200,
      }),
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      ...buildChangeMarkers({
        from,
        to,
        firmwareEvents: events,
        commands: commands.map((command) => ({ ...command, success: true })),
      }),
    };
  }

  /** Refresh OpenAPI status into statusJson + derived columns (detail page). */
  async refreshStatus(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const pairs = await this.tuya.getDeviceStatus(deviceId);
    const fromApi = statusFromPairs(pairs);
    // Merge so MQ-updated custom DPs are not wiped when OpenAPI returns a subset.
    const status = {
      ...asRecord(device.statusJson),
      ...fromApi,
    };
    const alerts = await this.prisma.alert.findMany({
      where: { deviceId: device.id, status: { not: 'closed' }, category: 'fault' },
      select: { faultCode: true, title: true },
      take: 20,
    });
    const fault = deriveFaultFields(status, {
      productId: device.productId,
      openFaultAlerts: alerts,
    });
    const fromDp = deriveSignalStrength(status);
    const signalStrength = fromDp ?? (await this.tuya.getDeviceSignal(deviceId));
    try {
      await this.syncOwnerBinding(device.id, deviceId);
    } catch {
      // Signal and status still update when the owner lookup fails.
    }

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        statusJson: status as Prisma.InputJsonValue,
        faultStatus: fault.faultStatus,
        faultInfo: fault.faultInfo,
        signalStrength,
        lastSeenAt: new Date(),
      },
    });

    return this.getByDeviceId(deviceId);
  }

  /** Device-user APIs are often empty; the device record's uid is the owner the user page already shows. */
  private eventTables(from: Date): Array<{
    findMany: (query: Record<string, unknown>) => Promise<Array<{ id?: string; eventTime: Date; bizCode?: string; payload?: unknown }>>;
    findFirst?: (query: Record<string, unknown>) => Promise<{ bizCode: string; eventTime: Date } | null>;
  }> {
    const hot = this.prisma.deviceEvent as unknown as {
      findMany: (query: Record<string, unknown>) => Promise<Array<{ id?: string; eventTime: Date; bizCode?: string; payload?: unknown }>>;
      findFirst?: (query: Record<string, unknown>) => Promise<{ bizCode: string; eventTime: Date } | null>;
    };
    const tables = [hot];
    const archive = (
      this.prisma as unknown as {
        deviceEventArchive?: (typeof tables)[number];
      }
    ).deviceEventArchive;
    if (archive?.findMany && from.getTime() < eventHotCutoff().getTime()) {
      tables.push(archive);
    }
    return tables;
  }

  private async loadShortEvents(
    deviceId: string,
    from: Date,
    to: Date,
    bizCode: { in: readonly string[] },
    select: Record<string, boolean>,
  ): Promise<Array<{ id?: string; eventTime: Date; bizCode?: string; payload: unknown }>> {
    const allowed = new Set<string>(bizCode.in);
    const where = { deviceId, eventTime: { gte: from, lte: to } };
    const chunks = await Promise.all(
      this.eventTables(from).map((table) =>
        table.findMany({
          where,
          orderBy: [{ eventTime: 'asc' }, { id: 'asc' }],
          select: { ...select, bizCode: true },
        }),
      ),
    );
    return chunks
      .flat()
      .filter((row) => allowed.has(String(row.bizCode)))
      .sort(compareEvents) as Array<{
      id?: string;
      eventTime: Date;
      bizCode?: string;
      payload: unknown;
    }>;
  }

  private async scanLongEvents(
    deviceId: string,
    from: Date,
    to: Date,
    bizCode: { in: readonly string[] },
    select: Record<string, boolean>,
    onPage: (page: Array<{ id?: string; eventTime: Date; bizCode?: string; payload: unknown }>) => void,
  ): Promise<void> {
    const allowed = new Set<string>(bizCode.in);
    const where = { deviceId, eventTime: { gte: from, lte: to } };
    for (const table of this.eventTables(from)) {
      await forEachEventPage(
        (query) => table.findMany(query as unknown as Record<string, unknown>),
        where,
        { ...select, bizCode: true },
        (page) => {
          const matched = page.filter((row) => allowed.has(String(row.bizCode)));
          if (matched.length > 0) {
            onPage(matched as Array<{ id?: string; eventTime: Date; bizCode?: string; payload: unknown }>);
          }
        },
      );
    }
  }

  /**
   * Latest stored value of one usage DP before `from`.
   * Empty property lists are skipped. A missing DP is not treated as zero.
   */
  private async latestUsageSampleBefore(
    deviceId: string,
    from: Date,
    schema: ReturnType<typeof getProductDps>,
    sourceDpId: string,
    scale: number,
  ): Promise<{ sample: UsageSample | null; anchor: UsageAnchor }> {
    const fromMs = from.getTime();
    const propertyCodes = new Set<string>(TREND_PROPERTY_BIZ_CODES);
    for (const table of this.eventTables(from)) {
      let cursor = from;
      let cursorId: string | null = null;
      let capped = false;
      for (let page = 0; page < USAGE_BASELINE_MAX_PAGES; page += 1) {
        const rows = await table.findMany({
          where: cursorId
            ? {
                deviceId,
                bizCode: { in: [...TREND_PROPERTY_BIZ_CODES] },
                OR: [
                  { eventTime: { lt: cursor } },
                  { AND: [{ eventTime: cursor }, { id: { lt: cursorId } }] },
                ],
              }
            : {
                deviceId,
                bizCode: { in: [...TREND_PROPERTY_BIZ_CODES] },
                eventTime: { lt: cursor },
              },
          orderBy: [{ eventTime: 'desc' }, { id: 'desc' }],
          take: LOOKBACK_PAGE_SIZE,
          select: { id: true, payload: true, eventTime: true, bizCode: true },
        });
        if (rows.length === 0) break;
        for (const event of rows) {
          const eventMs = event.eventTime instanceof Date ? event.eventTime.getTime() : Number.NaN;
          if (!Number.isFinite(eventMs) || eventMs >= fromMs) continue;
          if (event.bizCode && !propertyCodes.has(String(event.bizCode))) continue;
          let picked: UsageSample | null = null;
          for (const raw of extractDpSamples(event.payload, event.eventTime)) {
            if (resolveDpToken(raw.code, schema) !== sourceDpId) continue;
            if (raw.t >= fromMs) continue;
            if (!picked || raw.t >= picked.t) {
              picked = { t: raw.t, value: applyDpScale(raw.value, scale) };
            }
          }
          if (picked) return { sample: picked, anchor: 'found' };
        }
        if (rows.length < LOOKBACK_PAGE_SIZE) break;
        const last = rows[rows.length - 1];
        if (!last?.id || !(last.eventTime instanceof Date)) {
          capped = true;
          break;
        }
        if (cursorId && last.id === cursorId && last.eventTime.getTime() === cursor.getTime()) {
          capped = true;
          break;
        }
        if (last.eventTime.getTime() > cursor.getTime()) {
          capped = true;
          break;
        }
        cursor = last.eventTime;
        cursorId = last.id;
        capped = page === USAGE_BASELINE_MAX_PAGES - 1;
      }
      if (capped) return { sample: null, anchor: 'limited' };
    }
    return { sample: null, anchor: 'absent' };
  }

  private async latestEventBefore(
    deviceId: string,
    from: Date,
    bizCode: { in: readonly string[] },
  ): Promise<{ bizCode: string; eventTime: Date } | null> {
    const found: Array<{ bizCode: string; eventTime: Date }> = [];
    for (const table of this.eventTables(from)) {
      if (!table.findFirst) continue;
      for (const code of bizCode.in) {
        const row = await table.findFirst({
          where: { deviceId, eventTime: { lt: from }, bizCode: code },
          orderBy: { eventTime: 'desc' },
          select: { bizCode: true, eventTime: true },
        });
        if (row) found.push(row);
      }
    }
    found.sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());
    return found[0] ?? null;
  }

  private async fillStatusPrior(
    deviceId: string,
    from: Date,
    schema: ReturnType<typeof getProductDps>,
    byCode: Map<string, { dpId: string; type: 'enum' | 'bool'; range: string[] }>,
    prior: Map<string, { t: number; value: string }>,
  ): Promise<void> {
    for (const table of this.eventTables(from)) {
      let cursor = from;
      for (let page = 0; page < LOOKBACK_MAX_PAGES && prior.size < byCode.size; page += 1) {
        const rows = await table.findMany({
          where: { deviceId, eventTime: { lt: cursor } },
          orderBy: [{ eventTime: 'desc' }, { id: 'desc' }],
          take: LOOKBACK_PAGE_SIZE,
          select: { id: true, payload: true, eventTime: true },
        });
        if (rows.length === 0) break;
        for (const event of rows) {
          for (const sample of extractDpRawSamples(event.payload, event.eventTime)) {
            const code = resolveDpToken(sample.code, schema);
            const dp = byCode.get(code);
            if (!dp || prior.has(code)) continue;
            const value = normalizeStatusValue(dp, sample.value);
            if (!value) continue;
            prior.set(code, { t: sample.t, value });
          }
          if (prior.size === byCode.size) break;
        }
        if (rows.length < LOOKBACK_PAGE_SIZE) break;
        const last = rows[rows.length - 1];
        if (!last?.eventTime || last.eventTime.getTime() >= cursor.getTime()) break;
        cursor = last.eventTime;
      }
    }
  }

  private async syncOwnerBinding(internalId: string, tuyaDeviceId: string): Promise<void> {
    const profiles = await this.tuya.getDeviceUserProfiles(tuyaDeviceId);
    let owners = profiles.filter((profile) => profile.tuyaUid && !isDemoFixtureUid(profile.tuyaUid));
    if (owners.length === 0) {
      try {
        const detail = await this.tuya.getDevice(tuyaDeviceId);
        if (detail.uid && !isDemoFixtureUid(detail.uid)) {
          owners = [{ tuyaUid: detail.uid }];
        }
      } catch (err) {
        // Keep the last stored binding if the cloud device read fails.
        return;
      }
    }

    const endUserIds: string[] = [];
    for (const owner of owners) {
      const endUser = await this.prisma.endUser.upsert({
        where: { tuyaUid: owner.tuyaUid },
        update: { syncedAt: new Date() },
        create: { tuyaUid: owner.tuyaUid },
      });
      endUserIds.push(endUser.id);
    }

    await this.prisma.deviceBinding.deleteMany({
      where: {
        deviceId: internalId,
        ...(endUserIds.length > 0 ? { endUserId: { notIn: endUserIds } } : {}),
      },
    });
    for (const endUserId of endUserIds) {
      await this.prisma.deviceBinding.upsert({
        where: { deviceId_endUserId: { deviceId: internalId, endUserId } },
        update: { syncedAt: new Date() },
        create: { deviceId: internalId, endUserId, syncedAt: new Date() },
      });
    }
  }

  async getCloudReportLogs(
    deviceId: string,
    params: { codes?: string; hours?: number; size?: number; lastRowKey?: string; endTime?: number },
  ) {
    const device = await this.prisma.device.findUnique({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    const hours = Math.min(Math.max(params.hours ?? 168, 1), 168);
    const endTime =
      params.endTime != null && Number.isFinite(params.endTime) ? params.endTime : Date.now();
    const startTime = endTime - hours * 3600_000;
    const page = await this.tuya.getDeviceReportLogs({
      deviceId,
      codes: params.codes?.trim() || '',
      startTime,
      endTime,
      size: Math.min(params.size ?? 50, 100),
      lastRowKey: params.lastRowKey?.trim() || undefined,
    });
    return { ...page, startTime, endTime };
  }

  async getFirmware(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    const upgrades = await this.tuya.getDeviceUpgradeInfos(deviceId);
    return { deviceId, upgrades };
  }

  async listEvents(deviceId: string, params: ListDeviceEventsParams) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 100);
    const where: Prisma.DeviceEventWhereInput = { deviceId: device.id };

    const bizCodes = [
      ...(params.bizCodes
        ? params.bizCodes
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []),
      ...(params.bizCode ? [params.bizCode.trim()] : []),
    ];
    const uniqueBizCodes = [...new Set(bizCodes)];
    if (uniqueBizCodes.length === 1) {
      where.bizCode = uniqueBizCodes[0];
    } else if (uniqueBizCodes.length > 1) {
      where.bizCode = { in: uniqueBizCodes };
    }

    if (params.from || params.to) {
      where.eventTime = {};
      if (params.from) where.eventTime.gte = new Date(params.from);
      if (params.to) where.eventTime.lte = new Date(params.to);
    }

    const dpIds = [
      ...new Set(
        (params.dpId ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    // dpId filter needs payload scan — load a capped window then paginate in memory.
    if (dpIds.length) {
      if (!uniqueBizCodes.length) {
        where.bizCode = 'devicePropertyMessage';
      }
      const candidates = await this.prisma.deviceEvent.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        take: 501,
      });
      const limited = candidates.length > 500;
      const filtered = (limited ? candidates.slice(0, 500) : candidates).filter((e) =>
        dpIds.some((id) => payloadMatchesDpId(e.payload, id)),
      );
      const total = filtered.length;
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);
      return {
        items: items.map((e) => ({
          id: e.id,
          bizCode: e.bizCode,
          payload: e.payload,
          eventTime: e.eventTime,
          createdAt: e.createdAt,
        })),
        total,
        page,
        pageSize,
        limited,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.deviceEvent.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.deviceEvent.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        bizCode: e.bizCode,
        payload: e.payload,
        eventTime: e.eventTime,
        createdAt: e.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDetail(device: any) {
    return {
      deviceId: device.deviceId,
      productId: device.productId,
      name: device.name,
      onlineStatus: device.onlineStatus,
      statusJson: device.statusJson ?? {},
      faultStatus: device.faultStatus,
      faultInfo: device.faultInfo,
      lat: device.lat,
      lon: device.lon,
      locationText: presentLocationText(device.locationText, device.lat, device.lon),
      signalStrength: device.signalStrength,
      lastSeenAt: device.lastSeenAt,
      bindings: device.bindings.map(
        (binding: {
          endUser: {
            tuyaUid: string;
            username: string | null;
            mobile: string | null;
            email: string | null;
            remark: string | null;
          };
        }) => ({
          tuyaUid: binding.endUser.tuyaUid,
          username: binding.endUser.username,
          mobile: binding.endUser.mobile,
          email: binding.endUser.email,
          remark: binding.endUser.remark,
        }),
      ),
      openAlertCount: device.alerts.length,
    };
  }
}

function parseHistoryInstant(value: string | undefined, label: string): Date | undefined {
  if (value == null || value.trim() === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label}无效`);
  }
  return date;
}

function payloadMatchesDpId(payload: unknown, dpId: string): boolean {
  const needle = dpId.trim().toLowerCase();
  if (!needle || payload == null || typeof payload !== 'object') {
    return false;
  }
  const root = payload as Record<string, unknown>;
  const buckets: unknown[] = [];
  if (Array.isArray(root.status)) buckets.push(...root.status);
  if (Array.isArray(root.properties)) buckets.push(...root.properties);
  if (Array.isArray(root.dps)) buckets.push(...root.dps);
  if (root.data && typeof root.data === 'object') {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.status)) buckets.push(...data.status);
  }

  for (const item of buckets) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const candidates = [row.dpId, row.dp_id, row.id, row.code, row.dpCode];
    if (candidates.some((c) => c != null && String(c).toLowerCase() === needle)) {
      return true;
    }
  }

  // Also allow matching object-map keys: { "1": true } or { switch_1: true }
  for (const key of Object.keys(root)) {
    if (key.toLowerCase() === needle) return true;
  }
  return false;
}
