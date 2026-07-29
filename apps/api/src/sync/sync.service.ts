import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeviceOnlineStatus, Prisma } from '@prisma/client';
import {
  deriveFaultFields,
  deriveSignalStrength,
  formatLocationText,
  statusFromPairs,
} from '../devices/device-derived';
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
    let purgedMock = 0;
    let purgedDemoUsers = 0;

    const demoUsers = await this.prisma.endUser.findMany({
      where: { tuyaUid: { startsWith: 'uid-demo-' } },
      select: { id: true },
    });
    if (demoUsers.length > 0) {
      const ids = demoUsers.map((u) => u.id);
      await this.prisma.deviceBinding.deleteMany({ where: { endUserId: { in: ids } } });
      purgedDemoUsers = (
        await this.prisma.endUser.deleteMany({ where: { id: { in: ids } } })
      ).count;
      this.logger.warn(`Purged ${purgedDemoUsers} uid-demo-* end users`);
    }

    if (process.env.DEMO_MODE === 'live') {
      const mockDevices = await this.prisma.device.findMany({
        where: { deviceId: { startsWith: 'demo-' } },
        select: { id: true },
      });
      if (mockDevices.length > 0) {
        const ids = mockDevices.map((d) => d.id);
        await this.prisma.deviceBinding.deleteMany({ where: { deviceId: { in: ids } } });
        await this.prisma.deviceEvent.deleteMany({ where: { deviceId: { in: ids } } });
        await this.prisma.commandLog.deleteMany({ where: { deviceId: { in: ids } } });
        await this.prisma.alert.deleteMany({ where: { deviceId: { in: ids } } });
        const deleted = await this.prisma.device.deleteMany({ where: { id: { in: ids } } });
        purgedMock = deleted.count;
        this.logger.warn(`Purged ${purgedMock} mock demo-* devices before live reconcile`);
      }
    }

    for (const productId of this.productIds) {
      if (stoppedEarly) {
        break;
      }

      let lastId: string | undefined;

      for (;;) {
        const { list, total, nextLastId } = await this.tuya.listDevicesByProduct(productId, {
          lastId,
          pageSize: PAGE_SIZE,
        });

        const globalCount = await this.prisma.device.count();
        if (!lastId && total + globalCount > MAX_DEVICES) {
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

          if (!existing && currentCount >= MAX_DEVICES) {
            this.logger.warn(
              `Skipping new device ${summary.deviceId}: global count ${currentCount} >= ${MAX_DEVICES}`,
            );
            stoppedEarly = true;
            continue;
          }

          const device = await this.upsertDevice(summary, syncedAt);
          devicesSynced += 1;
          await this.refreshDeviceStatusDerived(device.id, summary.deviceId, summary.productId);
          const users = await this.tuya.getDeviceUserProfiles(summary.deviceId);
          bindingsSynced += await this.replaceBindings(device.id, users, syncedAt);
        }

        if (list.length === 0 || list.length < PAGE_SIZE || !nextLastId || nextLastId === lastId) {
          break;
        }
        lastId = nextLastId;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        adminUserId,
        action: 'sync.reconcile',
        resource: 'sync',
        detail: { devicesSynced, bindingsSynced, purgedMock, purgedDemoUsers } as Prisma.InputJsonValue,
      },
    });

    return { devicesSynced, bindingsSynced, purgedMock, purgedDemoUsers };
  }

  async reconcileDevice(adminUserId: string, deviceId: string) {
    if (process.env.DEMO_MODE !== 'live') {
      throw new Error('reconcileDevice requires DEMO_MODE=live');
    }
    const summary = await this.tuya.getDevice(deviceId);
    const device = await this.upsertDevice(summary, new Date());
    await this.refreshDeviceStatusDerived(device.id, deviceId, summary.productId);
    const users = await this.tuya.getDeviceUserProfiles(deviceId);
    const bindingsSynced = await this.replaceBindings(device.id, users, new Date());
    await this.prisma.auditLog.create({
      data: {
        adminUserId,
        action: 'sync.reconcileDevice',
        resource: deviceId,
        detail: { productId: summary.productId, bindingsSynced } as Prisma.InputJsonValue,
      },
    });
    return { device, bindingsSynced };
  }

  private async upsertDevice(summary: TuyaDeviceSummary, syncedAt: Date) {
    let onlineStatus: DeviceOnlineStatus = DeviceOnlineStatus.unknown;
    if (summary.online === true) {
      onlineStatus = DeviceOnlineStatus.online;
    } else if (summary.online === false) {
      onlineStatus = DeviceOnlineStatus.offline;
    }

    const lat = summary.lat ?? null;
    const lon = summary.lon ?? null;

    return this.prisma.device.upsert({
      where: { deviceId: summary.deviceId },
      update: {
        productId: summary.productId,
        name: summary.name || undefined,
        onlineStatus,
        lat,
        lon,
        locationText: formatLocationText(lat, lon),
        syncedAt,
      },
      create: {
        deviceId: summary.deviceId,
        productId: summary.productId,
        name: summary.name || null,
        onlineStatus,
        lat,
        lon,
        locationText: formatLocationText(lat, lon),
        syncedAt,
      },
    });
  }

  private async refreshDeviceStatusDerived(
    internalId: string,
    tuyaDeviceId: string,
    productId: string,
  ) {
    try {
      const pairs = await this.tuya.getDeviceStatus(tuyaDeviceId);
      const status = statusFromPairs(pairs);
      const alerts = await this.prisma.alert.findMany({
        where: { deviceId: internalId, status: { not: 'closed' } },
        select: { title: true },
        take: 5,
      });
      const fault = deriveFaultFields(
        status,
        alerts.map((a) => a.title),
        productId,
      );
      await this.prisma.device.update({
        where: { id: internalId },
        data: {
          statusJson: status as Prisma.InputJsonValue,
          faultStatus: fault.faultStatus,
          faultInfo: fault.faultInfo,
          signalStrength: deriveSignalStrength(status),
        },
      });
    } catch (err) {
      this.logger.warn(`status refresh failed for ${tuyaDeviceId}: ${String(err)}`);
    }
  }

  private async replaceBindings(
    deviceId: string,
    users: Array<{ tuyaUid: string; username?: string; mobile?: string; email?: string; raw?: Record<string, unknown> }>,
    syncedAt: Date,
  ): Promise<number> {
    const endUserIds: string[] = [];

    for (const seed of users) {
      const tuyaUid = seed.tuyaUid;
      if (!tuyaUid || tuyaUid.startsWith('uid-demo-')) continue;

      const profile = await this.tuya.getUserProfile(tuyaUid);
      const username = profile?.username || seed.username;
      const mobile = profile?.mobile || seed.mobile;
      const email = profile?.email || seed.email;
      const raw = profile?.raw || seed.raw;

      const endUser = await this.prisma.endUser.upsert({
        where: { tuyaUid },
        update: {
          syncedAt,
          ...(username ? { username } : {}),
          ...(mobile ? { mobile } : {}),
          ...(email ? { email } : {}),
          ...(raw ? { raw: raw as Prisma.InputJsonValue } : {}),
        },
        create: {
          tuyaUid,
          syncedAt,
          username,
          mobile,
          email,
          raw: raw ? (raw as Prisma.InputJsonValue) : undefined,
        },
      });
      endUserIds.push(endUser.id);
    }

    await this.prisma.deviceBinding.deleteMany({
      where: {
        deviceId,
        ...(endUserIds.length > 0 ? { endUserId: { notIn: endUserIds } } : {}),
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
