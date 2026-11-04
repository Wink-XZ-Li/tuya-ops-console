import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { eventHotCutoff } from '../devices/event-window';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertPartitionName,
  monthsToEnsure,
  partitionNamesToDrop,
  type ArchivePartition,
} from './event-archive';
import { jobsEnabled } from './jobs-enabled';

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_LOCK_BUDGET_MS = 2000;

export type RetentionReport = {
  dryRun: boolean;
  cutoff: string;
  hotCutoff: string;
  batchSize: number;
  lockBudgetMs: number;
  hotExpired: number;
  toArchive: number;
  archiveExpired: number;
  eventsArchived: number;
  eventsDeleted: number;
  archiveDeleted: number;
  commands: number;
  audits: number;
  alerts: number;
  batches: number;
  partitionsDropped: string[];
  stoppedEarly: boolean;
  slowestBatchMs: number;
};

@Injectable()
export class RetentionJob implements OnModuleInit {
  private readonly logger = new Logger(RetentionJob.name);
  // Raw event/log retention (env override). Rollup tables (DailyDeviceMetric /
  // DailyFaultStat / OpsReport) are NOT purged here.
  private readonly retentionDays = Number(process.env.RETENTION_DAYS ?? 90);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (!jobsEnabled()) return;
    if (process.env.RETENTION_RUN_ON_START === 'true') {
      void this.run().catch((err) =>
        this.logger.error('Retention job failed on start', err instanceof Error ? err.stack : err),
      );
    }
  }

  @Interval('retention', RETENTION_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!jobsEnabled()) return;
    try {
      await this.run();
    } catch (err) {
      this.logger.error('Retention job failed', err instanceof Error ? err.stack : err);
    }
  }

  /**
   * Move DeviceEvent rows older than the hot window into the monthly archive,
   * then delete expired rows in batches. Each DELETE/INSERT commits on its own
   * so a batch holds row locks only for `batchSize` rows, not the whole table.
   * RETENTION_DRY_RUN=true counts batches and does not write.
   */
  async run(options?: { dryRun?: boolean }): Promise<RetentionReport> {
    const dryRun = options?.dryRun ?? process.env.RETENTION_DRY_RUN === 'true';
    const batchSize = batchSizeFromEnv();
    const lockBudgetMs = lockBudgetFromEnv();
    const cutoff = this.getCutoffDate();
    const hotCutoff = eventHotCutoff();
    const report = emptyReport({
      dryRun,
      cutoff: cutoff.toISOString(),
      hotCutoff: hotCutoff.toISOString(),
      batchSize,
      lockBudgetMs,
    });

    if (dryRun) {
      report.partitionsDropped = await this.partitionsDue(cutoff);
    } else {
      await this.ensureFuturePartitions();
      report.partitionsDropped = await this.dropExpiredPartitions(cutoff);
    }

    report.hotExpired = await this.prisma.deviceEvent.count({
      where: { eventTime: { lt: cutoff } },
    });
    report.toArchive = await this.prisma.deviceEvent.count({
      where: { eventTime: { gte: cutoff, lt: hotCutoff } },
    });
    report.archiveExpired = await this.archiveCount(cutoff);
    report.commands = await this.prisma.commandLog.count({ where: { createdAt: { lt: cutoff } } });
    report.audits = await this.prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });
    report.alerts = await this.prisma.alert.count({
      where: { status: 'closed', openedAt: { lt: cutoff } },
    });

    if (dryRun) {
      report.batches =
        batchesFor(report.hotExpired, batchSize) +
        batchesFor(report.toArchive, batchSize) +
        batchesFor(report.archiveExpired, batchSize) +
        batchesFor(report.commands, batchSize) +
        batchesFor(report.audits, batchSize) +
        batchesFor(report.alerts, batchSize);
      this.logger.log(
        `Retention dry-run before ${cutoff.toISOString()}: hotExpired=${report.hotExpired}, toArchive=${report.toArchive}, archiveExpired=${report.archiveExpired}, batches=${report.batches}, lockBudgetMs=${lockBudgetMs}`,
      );
      return report;
    }

    report.eventsDeleted = await this.deleteInBatches(
      `DELETE FROM DeviceEvent WHERE eventTime < ? ORDER BY eventTime ASC LIMIT ${batchSize}`,
      [cutoff],
      batchSize,
      lockBudgetMs,
      report,
    );
    report.eventsArchived = await this.archiveHot(cutoff, hotCutoff, batchSize, lockBudgetMs, report);
    report.archiveDeleted = await this.deleteInBatches(
      `DELETE FROM DeviceEventArchive WHERE eventTime < ? ORDER BY eventTime ASC LIMIT ${batchSize}`,
      [cutoff],
      batchSize,
      lockBudgetMs,
      report,
    );
    report.commands = await this.deleteInBatches(
      `DELETE FROM CommandLog WHERE createdAt < ? ORDER BY createdAt ASC LIMIT ${batchSize}`,
      [cutoff],
      batchSize,
      lockBudgetMs,
      report,
    );
    report.audits = await this.deleteInBatches(
      `DELETE FROM AuditLog WHERE createdAt < ? ORDER BY createdAt ASC LIMIT ${batchSize}`,
      [cutoff],
      batchSize,
      lockBudgetMs,
      report,
    );
    report.alerts = await this.deleteInBatches(
      `DELETE FROM Alert WHERE status = 'closed' AND openedAt < ? ORDER BY openedAt ASC LIMIT ${batchSize}`,
      [cutoff],
      batchSize,
      lockBudgetMs,
      report,
    );

    this.logger.log(
      `Retention cleanup before ${cutoff.toISOString()}: archived=${report.eventsArchived}, events=${report.eventsDeleted}, archiveDeleted=${report.archiveDeleted}, commands=${report.commands}, audits=${report.audits}, alerts=${report.alerts}, batches=${report.batches}, slowestBatchMs=${report.slowestBatchMs}, stoppedEarly=${report.stoppedEarly}`,
    );
    return report;
  }

  getCutoffDate(): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    return cutoff;
  }

  private async archiveCount(cutoff: Date): Promise<number> {
    const archive = this.archive();
    if (!archive?.count) return 0;
    return archive.count({ where: { eventTime: { lt: cutoff } } });
  }

  private async archiveHot(
    retentionCutoff: Date,
    hotCutoff: Date,
    batchSize: number,
    lockBudgetMs: number,
    report: RetentionReport,
  ): Promise<number> {
    const archive = this.archive();
    if (!archive?.createMany || hotCutoff.getTime() <= retentionCutoff.getTime()) return 0;
    let moved = 0;
    for (;;) {
      if (report.stoppedEarly) return moved;
      const rows = await this.prisma.deviceEvent.findMany({
        where: { eventTime: { gte: retentionCutoff, lt: hotCutoff } },
        orderBy: { eventTime: 'asc' },
        take: batchSize,
      });
      if (rows.length === 0) return moved;
      const started = Date.now();
      await this.prisma.$transaction([
        archive.createMany({ data: rows, skipDuplicates: true }),
        this.prisma.deviceEvent.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } }),
      ] as never);
      const elapsed = Date.now() - started;
      report.batches += 1;
      report.slowestBatchMs = Math.max(report.slowestBatchMs, elapsed);
      moved += rows.length;
      if (elapsed > lockBudgetMs) {
        report.stoppedEarly = true;
        this.logger.error(
          `Retention archive batch took ${elapsed}ms, over the ${lockBudgetMs}ms lock budget; stopping`,
        );
        return moved;
      }
      if (rows.length < batchSize) return moved;
    }
  }

  private async deleteInBatches(
    sql: string,
    params: unknown[],
    batchSize: number,
    lockBudgetMs: number,
    report: RetentionReport,
  ): Promise<number> {
    let removed = 0;
    for (;;) {
      if (report.stoppedEarly) return removed;
      const started = Date.now();
      const affected = Number(await this.prisma.$executeRawUnsafe(sql, ...params));
      const elapsed = Date.now() - started;
      report.batches += 1;
      report.slowestBatchMs = Math.max(report.slowestBatchMs, elapsed);
      const count = Number.isFinite(affected) ? affected : 0;
      removed += count;
      if (elapsed > lockBudgetMs) {
        report.stoppedEarly = true;
        this.logger.error(
          `Retention delete batch took ${elapsed}ms, over the ${lockBudgetMs}ms lock budget; stopping`,
        );
        return removed;
      }
      if (count < batchSize) return removed;
    }
  }

  private async listPartitions(): Promise<ArchivePartition[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ name: string | null; description: string | null }>
      >(
        `SELECT PARTITION_NAME AS name, PARTITION_DESCRIPTION AS description
         FROM information_schema.PARTITIONS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DeviceEventArchive'`,
      );
      return rows
        .filter((row) => row.name)
        .map((row) => ({ name: String(row.name), description: String(row.description ?? '') }));
    } catch (err) {
      this.logger.warn(
        `DeviceEventArchive partitions unreadable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async partitionsDue(cutoff: Date): Promise<string[]> {
    const daysRow = await this.cutoffDays(cutoff);
    if (daysRow == null) return [];
    return partitionNamesToDrop(await this.listPartitions(), daysRow);
  }

  private async dropExpiredPartitions(cutoff: Date): Promise<string[]> {
    const names = await this.partitionsDue(cutoff);
    if (names.length === 0) return [];
    for (const name of names) assertPartitionName(name);
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE DeviceEventArchive DROP PARTITION ${names.join(', ')}`,
    );
    this.logger.log(`Dropped DeviceEventArchive partitions: ${names.join(', ')}`);
    return names;
  }

  private async ensureFuturePartitions(): Promise<void> {
    const existing = await this.listPartitions();
    if (!existing.some((partition) => partition.name === 'pmax')) return;
    const have = new Set(existing.map((partition) => partition.name));
    for (const month of monthsToEnsure(new Date())) {
      if (have.has(month.name)) continue;
      assertPartitionName(month.name);
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE DeviceEventArchive REORGANIZE PARTITION pmax INTO (
           PARTITION ${month.name} VALUES LESS THAN (TO_DAYS('${month.lessThan}')),
           PARTITION pmax VALUES LESS THAN MAXVALUE
         )`,
      );
      have.add(month.name);
    }
  }

  private async cutoffDays(cutoff: Date): Promise<number | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ days: unknown }>>(
        `SELECT TO_DAYS(?) AS days`,
        cutoff,
      );
      const days = Number(rows[0]?.days);
      return Number.isFinite(days) ? days : null;
    } catch {
      return null;
    }
  }

  private archive(): {
    count?: (args: unknown) => Promise<number>;
    createMany?: (args: unknown) => Promise<unknown>;
  } | null {
    const delegate = (this.prisma as unknown as { deviceEventArchive?: {
      count?: (args: unknown) => Promise<number>;
      createMany?: (args: unknown) => Promise<unknown>;
    } }).deviceEventArchive;
    return delegate ?? null;
  }
}

function batchSizeFromEnv(): number {
  const parsed = Number(process.env.RETENTION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(5000, Math.floor(parsed));
}

function lockBudgetFromEnv(): number {
  const parsed = Number(process.env.RETENTION_BATCH_LOCK_BUDGET_MS ?? DEFAULT_LOCK_BUDGET_MS);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LOCK_BUDGET_MS;
  return Math.floor(parsed);
}

function batchesFor(count: number, batchSize: number): number {
  if (count <= 0) return 0;
  return Math.ceil(count / batchSize);
}

function emptyReport(seed: Pick<RetentionReport, 'dryRun' | 'cutoff' | 'hotCutoff' | 'batchSize' | 'lockBudgetMs'>): RetentionReport {
  return {
    ...seed,
    hotExpired: 0,
    toArchive: 0,
    archiveExpired: 0,
    eventsArchived: 0,
    eventsDeleted: 0,
    archiveDeleted: 0,
    commands: 0,
    audits: 0,
    alerts: 0,
    batches: 0,
    partitionsDropped: [],
    stoppedEarly: false,
    slowestBatchMs: 0,
  };
}
