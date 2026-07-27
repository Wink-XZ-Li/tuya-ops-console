import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeviceOnlineStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseProductIds,
  TUYA_CLIENT,
  TuyaClient,
  TuyaDeviceSummary,
} from '../tuya/tuya.client';

const MAX_DEVICES_PER_PRODUCT = 10;
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

    for (const productId of this.productIds) {
      let page = 1;
      let processed = 0;

      for (;;) {
        const { list, total } = await this.tuya.listDevicesByProduct(productId, page);

        if (page === 1 && total >= MAX_DEVICES_PER_PRODUCT) {
          this.logger.warn(
            `Product ${productId}: total ${total} >= ${MAX_DEVICES_PER_PRODUCT}, truncating reconcile`,
          );
        }

        const cap =
          total >= MAX_DEVICES_PER_PRODUCT
            ? MAX_DEVICES_PER_PRODUCT - processed
            : list.length;
        const batch = list.slice(0, Math.max(0, cap));

        for (const summary of batch) {
          const device = await this.upsertDevice(summary, syncedAt);
          devicesSynced += 1;
          const users = await this.tuya.getDeviceUsers(summary.deviceId);
          bindingsSynced += await this.replaceBindings(device.id, users, syncedAt);
          processed += 1;
        }

        if (total >= MAX_DEVICES_PER_PRODUCT && processed >= MAX_DEVICES_PER_PRODUCT) {
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
