import { AlertStatus } from '@prisma/client';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { jobsEnabled } from './jobs-enabled';

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

  async run(): Promise<void> {
    const cutoff = this.getCutoffDate();
    const [events, commands, audits, alerts] = await Promise.all([
      this.prisma.deviceEvent.deleteMany({ where: { eventTime: { lt: cutoff } } }),
      this.prisma.commandLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.alert.deleteMany({
        where: {
          status: AlertStatus.closed,
          openedAt: { lt: cutoff },
        },
      }),
    ]);

    this.logger.log(
      `Retention cleanup before ${cutoff.toISOString()}: events=${events.count}, commands=${commands.count}, audits=${audits.count}, alerts=${alerts.count}`,
    );
  }

  getCutoffDate(): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    return cutoff;
  }
}
