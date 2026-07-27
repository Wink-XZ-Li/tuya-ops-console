import { AlertStatus } from '@prisma/client';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RetentionJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionJob.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retentionDays = Number(process.env.RETENTION_DAYS ?? 7),
  ) {}

  onModuleInit(): void {
    if (process.env.RETENTION_RUN_ON_START === 'true') {
      void this.run();
    }
    this.timer = setInterval(() => {
      void this.run();
    }, RETENTION_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
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
