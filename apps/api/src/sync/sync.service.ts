import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeviceOnlineStatus, Prisma } from '@prisma/client';
import { MAX_DEVICES } from '../demo/device-limits';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseProductIds,
  TUYA_CLIENT,
  TuyaClient,
  TuyaDeviceSummary,
} from '../tuya/tuya.client';

const PAGE_SIZE = 20;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly productIds = [...parseProductIds()];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TUYA_CLIENT) private readonly tuya: TuyaClient,
  ) {}

  async reconcileAll(adminUserId: string) {
    const syncedAt = new Date();
    let devicesSynced = 0;
    let bindingsSynced = 0;
    let stoppedEarly = false;

    for (const productId of this.productIds) {
      if (stoppedEarly) {
        break;
      }

      let page = 1;

      for (;;) {
        const globalCount = await this.prisma.device.count();
        if (globalCount >= MAX_DEVICES) {
          this.logger.warn(
            `Global device count ${globalCount} >= ${MAX_DEVICES}, stopping reconcile`,
          );
          stoppedEarly = true;
          break;
        }

        const { list, total } = await this.tuya.listDevicesByProduct(productId, page);

        if (page === 1 && total + globalCount > MAX_DEVICES) {
          this.logger.warn(
            `Product ${productId}: ${total} devices would exceed global cap (${globalCount}/${MAX_DEVICES}), truncating reconcile`,
          );
        }

        for (const summary of list) {
          const currentCount = await this.prisma.device.count();
          const existing = await this.prisma.device.findUnique({
            where: { deviceId: summary.deviceId },
            select: { id: true },
          });

          if (!existing && currentCount >= MAX_DEVICES - 1) {
            this.logger.warn(
              `Skipping new device ${summary.deviceId}: global count ${currentCount} would reach ${MAX_DEVICES}`,
            );
            stoppedEarly = true;
            break;
          }

          const device = await this.upsertDevice(summary, syncedAt);
          devicesSynced += 1;
          const users = await this.tuya.getDeviceUsers(summary.deviceId);
          bindingsSynced += await this.replaceBindings(device.id, users, syncedAt);
        }

        if (stoppedEarly) {
          break;
        }
        if (page * PAGE_SIZE >= total || list.length === 0) {
          break;
        }
        page += 1;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        adminUserId,
        action: 'sync.reconcile',
        resource: 'sync',
        detail: { devicesSynced, bindingsSynced } as Prisma.InputJsonValue,
      },
    });

    return { devicesSynced, bindingsSynced };
  }

  private async upsertDevice(summary: TuyaDeviceSummary, syncedAt: Date) {
    let onlineStatus: DeviceOnlineStatus = DeviceOnlineStatus.unknown;
    if (summary.online === true) {
      onlineStatus = DeviceOnlineStatus.online;
    } else if (summary.online === false) {
      onlineStatus = DeviceOnlineStatus.offline;
    }

    return this.prisma.device.upsert({
      where: { deviceId: summary.deviceId },
      update: {
        productId: summary.productId,
        name: summary.name,
        onlineStatus,
        syncedAt,
      },
      create: {
        deviceId: summary.deviceId,
        productId: summary.productId,
        name: summary.name,
        onlineStatus,
        syncedAt,
      },
    });
  }

  private async replaceBindings(
    deviceId: string,
    tuyaUids: string[],
    syncedAt: Date,
  ): Promise<number> {
    const endUserIds: string[] = [];

    for (const tuyaUid of tuyaUids) {
      const endUser = await this.prisma.endUser.upsert({
        where: { tuyaUid },
        update: { syncedAt },
        create: { tuyaUid, syncedAt },
      });
      endUserIds.push(endUser.id);
    }

    await this.prisma.deviceBinding.deleteMany({
      where: {
        deviceId,
        ...(endUserIds.length > 0
          ? { endUserId: { notIn: endUserIds } }
          : {}),
      },
    });

    for (const endUserId of endUserIds) {
      await this.prisma.deviceBinding.upsert({
        where: { deviceId_endUserId: { deviceId, endUserId } },
        update: { syncedAt },
        create: { deviceId, endUserId, syncedAt },
      });
    }

    return endUserIds.length;
  }
}
