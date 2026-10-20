import { AlertStatus, DeviceOnlineStatus } from '@prisma/client';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { offlineAlertActiveKey } from './backfill-fault-alerts';

const OFFLINE_RULE_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class OfflineRuleJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfflineRuleJob.name);
  private readonly offlineAlertMinutes = Number(process.env.OFFLINE_ALERT_MINUTES ?? 10);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.run().catch((err) =>
        this.logger.error('Offline rule job failed', err instanceof Error ? err.stack : err),
      );
    }, OFFLINE_RULE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - this.offlineAlertMinutes * 60 * 1000);
    const devices = await this.prisma.device.findMany({
      where: {
        onlineStatus: DeviceOnlineStatus.offline,
        lastSeenAt: { lt: cutoff },
      },
      select: { id: true, deviceId: true, lastSeenAt: true },
    });

    for (const device of devices) {
      const activeKey = offlineAlertActiveKey(device.id);
      const existing = await this.prisma.alert.findFirst({
        where: {
          deviceId: device.id,
          status: { not: AlertStatus.closed },
          OR: [
            { activeKey },
            { category: 'connectivity', faultCode: 'offline' },
            { source: 'local_offline' },
          ],
        },
      });
      if (existing) {
        continue;
      }

      const now = new Date();
      await this.prisma.alert.create({
        data: {
          deviceId: device.id,
          source: 'local_offline',
          category: 'connectivity',
          faultCode: 'offline',
          title: '设备长时间离线',
          fingerprint: activeKey,
          activeKey,
          conditionStartedAt: device.lastSeenAt ?? now,
          occurrenceCount: 1,
          lastSeenAt: now,
        },
      });
      this.logger.log(`Opened local_offline alert for device ${device.deviceId}`);
    }
  }
}
