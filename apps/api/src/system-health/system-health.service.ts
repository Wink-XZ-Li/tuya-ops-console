import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { readSystemHealthConfig } from './system-health.config';
import { SystemHealthCollector } from './system-health.collector';
import { evaluateSystemHealth } from './system-health.evaluate';
import type { HealthReport } from './system-health.types';

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collector: SystemHealthCollector,
  ) {}

  async inspect(options?: { auditUserId?: string }): Promise<HealthReport> {
    const started = Date.now();
    const config = readSystemHealthConfig();
    const signals = await this.collector.collect(config);
    const report = evaluateSystemHealth(signals, config, Date.now() - started);
    if (options?.auditUserId) {
      await this.audit(options.auditUserId, report);
    }
    return report;
  }

  private async audit(adminUserId: string, report: HealthReport): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          adminUserId,
          action: 'system-health.check',
          resource: 'system-health',
          detail: {
            status: report.status,
            durationMs: report.durationMs,
            issues: report.issues.map((issue) => issue.code),
          } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Manual system-health audit skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
