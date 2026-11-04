import { Prisma } from '@prisma/client';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  FAULT_ROLLUP_WHERE_SQL,
  FLEET_PRODUCT_ID,
  asCount,
  mergeFaultGroups,
  mttrMinutesAvg,
} from './fault-rollup';
import { jobsEnabled } from './jobs-enabled';

export { faultDurationMinutes, rollupFaultCode } from './fault-rollup';

const ROLLUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MODE_PAGE_SIZE = 400;

type ModeCounts = Record<string, number>;

@Injectable()
export class RollupJob implements OnModuleInit {
  private readonly logger = new Logger(RollupJob.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (!jobsEnabled()) return;
    if (process.env.ANALYTICS_ROLLUP_ON_START === 'true') {
      void this.run().catch((err) =>
        this.logger.error('Rollup job failed on start', err instanceof Error ? err.stack : err),
      );
    }
  }

  @Interval('rollup', ROLLUP_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!jobsEnabled()) return;
    try {
      await this.run();
    } catch (err) {
      this.logger.error('Rollup job failed', err instanceof Error ? err.stack : err);
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
    type Bucket = {
      onlineCount: number;
      offlineCount: number;
      faultCount: number;
      totalDevices: number;
      modeCounts: ModeCounts;
    };

    const grouped = await this.prisma.$queryRawUnsafe<
      Array<{
        productId: string;
        onlineCount: unknown;
        offlineCount: unknown;
        faultCount: unknown;
        totalDevices: unknown;
      }>
    >(`
      SELECT productId,
             CAST(SUM(onlineStatus = 'online') AS SIGNED) AS onlineCount,
             CAST(SUM(onlineStatus = 'offline') AS SIGNED) AS offlineCount,
             CAST(SUM(faultStatus = 'fault') AS SIGNED) AS faultCount,
             CAST(COUNT(*) AS SIGNED) AS totalDevices
      FROM Device
      GROUP BY productId
    `);

    const byProduct = new Map<string, Bucket>();
    const fleet: Bucket = {
      onlineCount: 0,
      offlineCount: 0,
      faultCount: 0,
      totalDevices: 0,
      modeCounts: {},
    };

    for (const row of grouped) {
      const bucket: Bucket = {
        onlineCount: asCount(row.onlineCount),
        offlineCount: asCount(row.offlineCount),
        faultCount: asCount(row.faultCount),
        totalDevices: asCount(row.totalDevices),
        modeCounts: {},
      };
      byProduct.set(row.productId, bucket);
      fleet.onlineCount += bucket.onlineCount;
      fleet.offlineCount += bucket.offlineCount;
      fleet.faultCount += bucket.faultCount;
      fleet.totalDevices += bucket.totalDevices;
    }

    // modeCounts live inside statusJson. Page them; the numeric snapshot above is the GROUP BY.
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.device.findMany({
        take: MODE_PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, productId: true, statusJson: true },
      });
      for (const device of page) {
        const mode = extractModeLabel(device.statusJson);
        if (!mode) continue;
        fleet.modeCounts[mode] = (fleet.modeCounts[mode] ?? 0) + 1;
        const bucket = byProduct.get(device.productId);
        if (!bucket) continue;
        bucket.modeCounts[mode] = (bucket.modeCounts[mode] ?? 0) + 1;
      }
      if (page.length < MODE_PAGE_SIZE) break;
      cursor = page[page.length - 1]?.id;
      if (!cursor) break;
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
    const where = FAULT_ROLLUP_WHERE_SQL;
    const [opened, closed, stillOpen] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        Array<{ productId: string; faultCode: string; newCount: unknown }>
      >(
        `
        SELECT d.productId AS productId,
               TRIM(a.faultCode) AS faultCode,
               CAST(COUNT(*) AS SIGNED) AS newCount
        FROM Alert a
        INNER JOIN Device d ON d.id = a.deviceId
        WHERE a.openedAt >= ? AND a.openedAt < ?
          AND ${where}
        GROUP BY d.productId, TRIM(a.faultCode)
        `,
        start,
        end,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{ productId: string; faultCode: string; closedCount: unknown; mttrSum: unknown }>
      >(
        `
        SELECT d.productId AS productId,
               TRIM(a.faultCode) AS faultCode,
               CAST(COUNT(*) AS SIGNED) AS closedCount,
               CAST(SUM(GREATEST(0, ROUND(
                 TIMESTAMPDIFF(MICROSECOND, COALESCE(a.conditionStartedAt, a.openedAt), a.closedAt) / 60000000
               ))) AS SIGNED) AS mttrSum
        FROM Alert a
        INNER JOIN Device d ON d.id = a.deviceId
        WHERE a.status = 'closed'
          AND a.closedAt >= ? AND a.closedAt < ?
          AND ${where}
        GROUP BY d.productId, TRIM(a.faultCode)
        `,
        start,
        end,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{ productId: string; faultCode: string; openCount: unknown }>
      >(
        `
        SELECT d.productId AS productId,
               TRIM(a.faultCode) AS faultCode,
               CAST(COUNT(*) AS SIGNED) AS openCount
        FROM Alert a
        INNER JOIN Device d ON d.id = a.deviceId
        WHERE a.status <> 'closed'
          AND a.openedAt < ?
          AND ${where}
        GROUP BY d.productId, TRIM(a.faultCode)
        `,
        end,
      ),
    ]);

    await this.prisma.dailyFaultStat.deleteMany({ where: { day: dayKey } });

    const buckets = mergeFaultGroups({
      opened: opened.map((row) => ({
        productId: row.productId,
        faultCode: row.faultCode,
        newCount: asCount(row.newCount),
      })),
      closed: closed.map((row) => ({
        productId: row.productId,
        faultCode: row.faultCode,
        closedCount: asCount(row.closedCount),
        mttrSum: asCount(row.mttrSum),
      })),
      stillOpen: stillOpen.map((row) => ({
        productId: row.productId,
        faultCode: row.faultCode,
        openCount: asCount(row.openCount),
      })),
    });

    for (const bucket of buckets) {
      const avg = mttrMinutesAvg(bucket);
      await this.prisma.dailyFaultStat.upsert({
        where: {
          day_productId_faultCode: {
            day: dayKey,
            productId: bucket.productId,
            faultCode: bucket.faultCode,
          },
        },
        create: {
          day: dayKey,
          productId: bucket.productId,
          faultCode: bucket.faultCode,
          openCount: bucket.openCount,
          newCount: bucket.newCount,
          closedCount: bucket.closedCount,
          mttrMinutesAvg: avg,
        },
        update: {
          openCount: bucket.openCount,
          newCount: bucket.newCount,
          closedCount: bucket.closedCount,
          mttrMinutesAvg: avg,
        },
      });
    }
  }
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
