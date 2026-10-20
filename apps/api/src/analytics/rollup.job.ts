import {
  AlertStatus,
  DeviceFaultStatus,
  DeviceOnlineStatus,
  Prisma,
} from '@prisma/client';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ROLLUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FLEET_PRODUCT_ID = '';

type ModeCounts = Record<string, number>;

@Injectable()
export class RollupJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RollupJob.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.ANALYTICS_ROLLUP_ON_START === 'true') {
      void this.run().catch((err) =>
        this.logger.error('Rollup job failed on start', err instanceof Error ? err.stack : err),
      );
    }
    this.timer = setInterval(() => {
      void this.run().catch((err) =>
        this.logger.error('Rollup job failed', err instanceof Error ? err.stack : err),
      );
    }, ROLLUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Snapshot today and re-close yesterday (end-of-day completeness). */
  async run(): Promise<void> {
    const today = startOfLocalDay(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    await this.rollupDay(yesterday);
    await this.rollupDay(today);
  }

  /** Upsert DailyDeviceMetric + DailyFaultStat for a calendar day. */
  async rollupDay(day: Date): Promise<void> {
    const dayKey = formatYmd(day);
    const { start, end } = dayWindow(day);

    await this.rollupDeviceMetrics(dayKey);
    await this.rollupFaultStats(dayKey, start, end);

    this.logger.log(`Analytics rollup complete for ${dayKey}`);
  }

  private async rollupDeviceMetrics(dayKey: string): Promise<void> {
    const devices = await this.prisma.device.findMany({
      select: {
        productId: true,
        onlineStatus: true,
        faultStatus: true,
        statusJson: true,
      },
    });

    type Bucket = {
      onlineCount: number;
      offlineCount: number;
      faultCount: number;
      totalDevices: number;
      modeCounts: ModeCounts;
    };

    const byProduct = new Map<string, Bucket>();
    const fleet: Bucket = {
      onlineCount: 0,
      offlineCount: 0,
      faultCount: 0,
      totalDevices: 0,
      modeCounts: {},
    };

    const bump = (b: Bucket, device: (typeof devices)[number]) => {
      b.totalDevices += 1;
      if (device.onlineStatus === DeviceOnlineStatus.online) b.onlineCount += 1;
      else if (device.onlineStatus === DeviceOnlineStatus.offline) b.offlineCount += 1;
      if (device.faultStatus === DeviceFaultStatus.fault) b.faultCount += 1;
      const mode = extractModeLabel(device.statusJson);
      if (mode) b.modeCounts[mode] = (b.modeCounts[mode] ?? 0) + 1;
    };

    for (const device of devices) {
      bump(fleet, device);
      let bucket = byProduct.get(device.productId);
      if (!bucket) {
        bucket = {
          onlineCount: 0,
          offlineCount: 0,
          faultCount: 0,
          totalDevices: 0,
          modeCounts: {},
        };
        byProduct.set(device.productId, bucket);
      }
      bump(bucket, device);
    }

    const upserts: Array<Promise<unknown>> = [
      this.upsertDeviceMetric(dayKey, FLEET_PRODUCT_ID, fleet),
    ];
    for (const [productId, bucket] of byProduct) {
      upserts.push(this.upsertDeviceMetric(dayKey, productId, bucket));
    }
    await Promise.all(upserts);
  }

  private async upsertDeviceMetric(
    dayKey: string,
    productId: string,
    bucket: {
      onlineCount: number;
      offlineCount: number;
      faultCount: number;
      totalDevices: number;
      modeCounts: ModeCounts;
    },
  ): Promise<void> {
    const modeCounts =
      Object.keys(bucket.modeCounts).length > 0
        ? (bucket.modeCounts as Prisma.InputJsonValue)
        : Prisma.JsonNull;

    await this.prisma.dailyDeviceMetric.upsert({
      where: { day_productId: { day: dayKey, productId } },
      create: {
        day: dayKey,
        productId,
        onlineCount: bucket.onlineCount,
        offlineCount: bucket.offlineCount,
        faultCount: bucket.faultCount,
        totalDevices: bucket.totalDevices,
        modeCounts,
      },
      update: {
        onlineCount: bucket.onlineCount,
        offlineCount: bucket.offlineCount,
        faultCount: bucket.faultCount,
        totalDevices: bucket.totalDevices,
        modeCounts,
      },
    });
  }

  private async rollupFaultStats(
    dayKey: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const [opened, closed, stillOpen] = await Promise.all([
      this.prisma.alert.findMany({
        where: { openedAt: { gte: start, lt: end } },
        select: {
          faultCode: true,
          category: true,
          device: { select: { productId: true } },
        },
      }),
      this.prisma.alert.findMany({
        where: {
          status: AlertStatus.closed,
          closedAt: { gte: start, lt: end },
        },
        select: {
          faultCode: true,
          category: true,
          openedAt: true,
          closedAt: true,
          conditionStartedAt: true,
          device: { select: { productId: true } },
        },
      }),
      this.prisma.alert.findMany({
        where: {
          status: { not: AlertStatus.closed },
          openedAt: { lt: end },
        },
        select: {
          faultCode: true,
          category: true,
          device: { select: { productId: true } },
        },
      }),
    ]);

    type FaultBucket = {
      openCount: number;
      newCount: number;
      closedCount: number;
      mttrSum: number;
      mttrN: number;
    };

    const keyOf = (productId: string, faultCode: string) => `${productId}\0${faultCode}`;
    const buckets = new Map<string, FaultBucket>();

    const ensure = (productId: string, faultCode: string): FaultBucket => {
      const k = keyOf(productId, faultCode);
      let b = buckets.get(k);
      if (!b) {
        b = { openCount: 0, newCount: 0, closedCount: 0, mttrSum: 0, mttrN: 0 };
        buckets.set(k, b);
      }
      return b;
    };

    await this.prisma.dailyFaultStat.deleteMany({ where: { day: dayKey } });

    for (const row of opened) {
      const faultCode = rollupFaultCode(row);
      if (!faultCode) continue;
      const productId = row.device.productId;
      ensure(productId, faultCode).newCount += 1;
      ensure(FLEET_PRODUCT_ID, faultCode).newCount += 1;
    }

    for (const row of closed) {
      const faultCode = rollupFaultCode(row);
      const closedAt = row.closedAt;
      if (!faultCode || !closedAt) continue;
      const productId = row.device.productId;
      for (const pid of [productId, FLEET_PRODUCT_ID]) {
        const b = ensure(pid, faultCode);
        b.closedCount += 1;
        b.mttrSum += faultDurationMinutes({
          openedAt: row.openedAt,
          closedAt,
          conditionStartedAt: row.conditionStartedAt,
        });
        b.mttrN += 1;
      }
    }

    for (const row of stillOpen) {
      const faultCode = rollupFaultCode(row);
      if (!faultCode) continue;
      ensure(row.device.productId, faultCode).openCount += 1;
      ensure(FLEET_PRODUCT_ID, faultCode).openCount += 1;
    }

    for (const [composite, bucket] of buckets) {
      const sep = composite.indexOf('\0');
      const productId = composite.slice(0, sep);
      const faultCode = composite.slice(sep + 1);
      if (
        !faultCode ||
        faultCode === 'unknown' ||
        (bucket.newCount === 0 && bucket.openCount === 0 && bucket.closedCount === 0)
      ) {
        continue;
      }
      const mttrMinutesAvg =
        bucket.mttrN > 0 ? Math.round(bucket.mttrSum / bucket.mttrN) : null;

      await this.prisma.dailyFaultStat.upsert({
        where: {
          day_productId_faultCode: { day: dayKey, productId, faultCode },
        },
        create: {
          day: dayKey,
          productId,
          faultCode,
          openCount: bucket.openCount,
          newCount: bucket.newCount,
          closedCount: bucket.closedCount,
          mttrMinutesAvg,
        },
        update: {
          openCount: bucket.openCount,
          newCount: bucket.newCount,
          closedCount: bucket.closedCount,
          mttrMinutesAvg,
        },
      });
    }
  }
}

/** Fault-stat key. Connectivity, offline, blank, and `unknown` are omitted so they are not written. */
export function rollupFaultCode(row: {
  faultCode?: string | null;
  category?: string | null;
}): string | null {
  if (row.category === 'connectivity' || row.faultCode === 'offline') return null;
  const code = row.faultCode?.trim();
  if (!code || code === 'unknown') return null;
  return code;
}

export function faultDurationMinutes(row: {
  openedAt: Date;
  closedAt: Date;
  conditionStartedAt?: Date | null;
}): number {
  const start = row.conditionStartedAt ?? row.openedAt;
  return Math.max(0, Math.round((row.closedAt.getTime() - start.getTime()) / 60000));
}

export function extractModeLabel(statusJson: unknown): string | null {
  if (statusJson == null) return null;

  const candidates: Array<{ code: string; value: unknown }> = [];

  const pushRows = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const item of rows) {
      if (!item || typeof item !== 'object') continue;
      const row = item as { code?: unknown; value?: unknown };
      const code = String(row.code ?? '');
      if (code) candidates.push({ code, value: row.value });
    }
  };

  if (Array.isArray(statusJson)) {
    pushRows(statusJson);
  } else if (typeof statusJson === 'object') {
    const obj = statusJson as Record<string, unknown>;
    if (Array.isArray(obj.status)) {
      pushRows(obj.status);
    } else {
      for (const [code, value] of Object.entries(obj)) {
        candidates.push({ code, value });
      }
    }
  } else {
    return null;
  }

  const modeCodes = new Set(['mode', 'work_mode', 'workmode', 'eco', 'sleep']);
  for (const { code, value } of candidates) {
    const lower = code.toLowerCase();
    if (!modeCodes.has(lower) && !lower.includes('mode')) continue;
    if (value === false || value === 0 || value === '0' || value === 'false' || value == null) {
      continue;
    }
    if (value === true || value === 1 || value === '1' || value === 'true') {
      return lower === 'eco' || lower === 'sleep' ? lower : lower;
    }
    return String(value);
  }
  return null;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayWindow(day: Date): { start: Date; end: Date } {
  const start = startOfLocalDay(day);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
