import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeviceOnlineStatus, Prisma } from '@prisma/client';
import { presentLocationText } from '../devices/china-admin';
import {
  deriveFaultFields,
  deriveSignalStrength,
  formatLocationText,
  statusFromPairs,
} from '../devices/device-derived';
import { MAX_DEVICES } from '../demo/device-limits';
import { PrismaService } from '../prisma/prisma.service';
import { TUYA_CLIENT, TuyaClient, TuyaDeviceSummary, TuyaUserProfile } from '../tuya/tuya.client';

const PAGE_SIZE = 20;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

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

    let lastId: string | undefined;
    const seenDeviceIds = new Set<string>();
    for (;;) {
      if (stoppedEarly) break;

      const { list, total, nextLastId } = await this.tuya.listDevices({
        lastId,
        pageSize: PAGE_SIZE,
      });

      const globalCount = await this.prisma.device.count();
      if (!lastId && total + globalCount > MAX_DEVICES) {
        this.logger.warn(
          `Cloud devices (${total}) would exceed global cap (${globalCount}/${MAX_DEVICES}), truncating reconcile`,
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
        seenDeviceIds.add(summary.deviceId);
        devicesSynced += 1;
        await this.refreshDeviceStatusDerived(device.id, summary.deviceId, summary.productId);
        const users = await this.ownersFor(summary);
        bindingsSynced += await this.replaceBindings(device.id, users, syncedAt);
      }

      if (list.length === 0 || list.length < PAGE_SIZE || !nextLastId || nextLastId === lastId) {
        break;
      }
      lastId = nextLastId;
    }

    let removedDevices = 0;
    if (!stoppedEarly) {
      removedDevices = await this.removeDevicesMissingFromCloud(seenDeviceIds);
    }

    await this.prisma.auditLog.create({
      data: {
        adminUserId,
        action: 'sync.reconcile',
        resource: 'sync',
        detail: { devicesSynced, bindingsSynced, purgedMock, purgedDemoUsers, removedDevices } as Prisma.InputJsonValue,
      },
    });

    return { devicesSynced, bindingsSynced, purgedMock, purgedDemoUsers, removedDevices };
  }

  /**
   * Full App user sync via GET /v1.0/apps/{schema}/users (page_no until has_more=false).
   * Does not touch devices or bindings.
   */
  async reconcileUsers(adminUserId: string) {
    const schema = (process.env.TUYA_APP_SCHEMA ?? '').trim();
    if (!schema) {
      throw new Error(
        '未配置 TUYA_APP_SCHEMA（App 渠道标识符）。请在 .env 填写后重启 API，再点「同步用户」。',
      );
    }

    const syncedAt = new Date();
    let usersSynced = 0;
    let pages = 0;
    let pageNo = 1;
    let reportedTotal: number | undefined;

    for (;;) {
      const page = await this.tuya.listAppUsers({
        schema,
        pageNo,
        pageSize: 100,
      });
      pages += 1;
      if (typeof page.total === 'number') reportedTotal = page.total;

      for (const profile of page.list) {
        if (!profile.tuyaUid || profile.tuyaUid.startsWith('uid-demo-')) continue;
        await this.prisma.endUser.upsert({
          where: { tuyaUid: profile.tuyaUid },
          update: {
            syncedAt,
            ...(profile.username ? { username: profile.username } : {}),
            ...(profile.nickName ? { nickName: profile.nickName } : {}),
            ...(profile.mobile ? { mobile: profile.mobile } : {}),
            ...(profile.email ? { email: profile.email } : {}),
            ...(profile.countryCode ? { countryCode: profile.countryCode } : {}),
            ...(profile.timeZoneId ? { timeZoneId: profile.timeZoneId } : {}),
            ...(profile.tempUnit != null ? { tempUnit: profile.tempUnit } : {}),
            ...(profile.avatar ? { avatar: profile.avatar } : {}),
            ...(profile.cloudCreatedAt ? { cloudCreatedAt: profile.cloudCreatedAt } : {}),
            ...(profile.cloudUpdatedAt ? { cloudUpdatedAt: profile.cloudUpdatedAt } : {}),
            ...(profile.raw ? { raw: profile.raw as Prisma.InputJsonValue } : {}),
          },
          create: {
            tuyaUid: profile.tuyaUid,
            syncedAt,
            username: profile.username,
            nickName: profile.nickName,
            mobile: profile.mobile,
            email: profile.email,
            countryCode: profile.countryCode,
            timeZoneId: profile.timeZoneId,
            tempUnit: profile.tempUnit,
            avatar: profile.avatar,
            cloudCreatedAt: profile.cloudCreatedAt,
            cloudUpdatedAt: profile.cloudUpdatedAt,
            raw: profile.raw ? (profile.raw as Prisma.InputJsonValue) : undefined,
          },
        });
        usersSynced += 1;
      }

      if (!page.hasMore || page.list.length === 0) break;
      pageNo += 1;
      if (pages >= 500) {
        this.logger.warn('listAppUsers page safety cap (500) reached; stopping');
        break;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        adminUserId,
        action: 'sync.reconcileUsers',
        resource: 'end-users',
        detail: { usersSynced, pages, schema, total: reportedTotal } as Prisma.InputJsonValue,
      },
    });

    return { usersSynced, pages, total: reportedTotal };
  }

  async reconcileDevice(adminUserId: string, deviceId: string) {
    if (process.env.DEMO_MODE !== 'live') {
      throw new Error('reconcileDevice requires DEMO_MODE=live');
    }
    const summary = await this.tuya.getDevice(deviceId);
    const device = await this.upsertDevice(summary, new Date());
    await this.refreshDeviceStatusDerived(device.id, deviceId, summary.productId);
    const users = await this.ownersFor(summary);
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
    const locationText = await this.resolveLocationText(lat, lon);

    return this.prisma.device.upsert({
      where: { deviceId: summary.deviceId },
      update: {
        productId: summary.productId,
        name: summary.name || undefined,
        onlineStatus,
        lat,
        lon,
        locationText,
        syncedAt,
      },
      create: {
        deviceId: summary.deviceId,
        productId: summary.productId,
        name: summary.name || null,
        onlineStatus,
        lat,
        lon,
        locationText,
        syncedAt,
      },
    });
  }

  private async resolveLocationText(
    lat: string | null,
    lon: string | null,
  ): Promise<string | null> {
    if (!lat || !lon) return formatLocationText(lat, lon);
    let address: string | null = null;
    try {
      const geo = await this.tuya.reverseGeocode({ latitude: lat, longitude: lon });
      address = geo.address?.trim() || null;
    } catch (err) {
      this.logger.debug(`reverseGeocode failed for ${lat},${lon}: ${String(err)}`);
    }
    return presentLocationText(address, lat, lon) ?? formatLocationText(lat, lon);
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
        where: { deviceId: internalId, status: { not: 'closed' }, category: 'fault' },
        select: { faultCode: true, title: true },
        take: 20,
      });
      const fault = deriveFaultFields(status, {
        productId,
        openFaultAlerts: alerts,
      });
      const fromDp = deriveSignalStrength(status);
      const signalStrength = fromDp ?? (await this.tuya.getDeviceSignal(tuyaDeviceId));
      await this.prisma.device.update({
        where: { id: internalId },
        data: {
          statusJson: status as Prisma.InputJsonValue,
          faultStatus: fault.faultStatus,
          faultInfo: fault.faultInfo,
          signalStrength,
        },
      });
    } catch (err) {
      this.logger.warn(`status refresh failed for ${tuyaDeviceId}: ${String(err)}`);
    }
  }

  private async ownersFor(summary: TuyaDeviceSummary): Promise<TuyaUserProfile[]> {
    const profiles = await this.tuya.getDeviceUserProfiles(summary.deviceId);
    if (profiles.length > 0) return profiles;
    if (summary.uid) return [{ tuyaUid: summary.uid }];
    try {
      const detail = await this.tuya.getDevice(summary.deviceId);
      if (detail.uid) return [{ tuyaUid: detail.uid }];
    } catch (err) {
      this.logger.debug(`owner lookup failed for ${summary.deviceId}: ${String(err)}`);
    }
    return [];
  }

  private async removeDevicesMissingFromCloud(seenDeviceIds: Set<string>): Promise<number> {
    const local = await this.prisma.device.findMany({
      select: { id: true, deviceId: true },
    });
    const stale = local.filter((device) => !seenDeviceIds.has(device.deviceId));
    if (stale.length === 0) return 0;
    const ids = stale.map((device) => device.id);
    await this.prisma.deviceBinding.deleteMany({ where: { deviceId: { in: ids } } });
    await this.prisma.deviceEvent.deleteMany({ where: { deviceId: { in: ids } } });
    await this.prisma.commandLog.deleteMany({ where: { deviceId: { in: ids } } });
    await this.prisma.alert.deleteMany({ where: { deviceId: { in: ids } } });
    const deleted = await this.prisma.device.deleteMany({ where: { id: { in: ids } } });
    this.logger.warn(
      `Removed ${deleted.count} devices no longer associated in Tuya cloud`,
    );
    return deleted.count;
  }

  private async replaceBindings(
    deviceId: string,
    users: Array<{
      tuyaUid: string;
      username?: string;
      nickName?: string;
      mobile?: string;
      email?: string;
      countryCode?: string;
      timeZoneId?: string;
      tempUnit?: number;
      avatar?: string;
      cloudCreatedAt?: Date;
      cloudUpdatedAt?: Date;
      raw?: Record<string, unknown>;
    }>,
    syncedAt: Date,
  ): Promise<number> {
    const endUserIds: string[] = [];

    for (const seed of users) {
      const tuyaUid = seed.tuyaUid;
      if (!tuyaUid || tuyaUid.startsWith('uid-demo-')) continue;

      const profile = await this.tuya.getUserProfile(tuyaUid);
      const username = profile?.username || seed.username;
      const nickName = profile?.nickName || seed.nickName;
      const mobile = profile?.mobile || seed.mobile;
      const email = profile?.email || seed.email;
      const countryCode = profile?.countryCode || seed.countryCode;
      const timeZoneId = profile?.timeZoneId || seed.timeZoneId;
      const tempUnit = profile?.tempUnit ?? seed.tempUnit;
      const avatar = profile?.avatar || seed.avatar;
      const cloudCreatedAt = profile?.cloudCreatedAt || seed.cloudCreatedAt;
      const cloudUpdatedAt = profile?.cloudUpdatedAt || seed.cloudUpdatedAt;
      const raw = profile?.raw || seed.raw;

      const endUser = await this.prisma.endUser.upsert({
        where: { tuyaUid },
        update: {
          syncedAt,
          ...(username ? { username } : {}),
          ...(nickName ? { nickName } : {}),
          ...(mobile ? { mobile } : {}),
          ...(email ? { email } : {}),
          ...(countryCode ? { countryCode } : {}),
          ...(timeZoneId ? { timeZoneId } : {}),
          ...(tempUnit != null ? { tempUnit } : {}),
          ...(avatar ? { avatar } : {}),
          ...(cloudCreatedAt ? { cloudCreatedAt } : {}),
          ...(cloudUpdatedAt ? { cloudUpdatedAt } : {}),
          ...(raw ? { raw: raw as Prisma.InputJsonValue } : {}),
        },
        create: {
          tuyaUid,
          syncedAt,
          username,
          nickName,
          mobile,
          email,
          countryCode,
          timeZoneId,
          tempUnit,
          avatar,
          cloudCreatedAt,
          cloudUpdatedAt,
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
