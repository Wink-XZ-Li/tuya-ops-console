import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TUYA_CLIENT,
  TuyaClient,
  TuyaUserDevice,
  TuyaUserHome,
  TuyaUserProfile,
} from '../tuya/tuya.client';

export interface ListEndUsersParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface CloudDeviceRow extends TuyaUserDevice {
  inConsole: boolean;
  allowedProduct: boolean;
}

@Injectable()
export class EndUsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TUYA_CLIENT) private readonly tuya: TuyaClient,
  ) {}

  async list(params: ListEndUsersParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const where: Prisma.EndUserWhereInput = {
      NOT: { tuyaUid: { startsWith: 'uid-demo-' } },
    };

    if (params.q) {
      where.AND = [
        {
          OR: [
            { tuyaUid: { contains: params.q } },
            { username: { contains: params.q } },
            { nickName: { contains: params.q } },
            { mobile: { contains: params.q } },
            { email: { contains: params.q } },
            { remark: { contains: params.q } },
          ],
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.endUser.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.endUser.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getByTuyaUid(tuyaUid: string) {
    const endUser = await this.prisma.endUser.findUnique({ where: { tuyaUid } });
    if (!endUser) {
      throw new NotFoundException(`End user ${tuyaUid} not found`);
    }
    return endUser;
  }

  /**
   * Live cloud snapshot for detail page: refresh infos into DB, fetch homes + devices.
   * Does not mutate DeviceBinding.
   */
  async getCloudSnapshot(tuyaUid: string) {
    await this.getByTuyaUid(tuyaUid);
    const warnings: string[] = [];

    let user = await this.applyProfileFromCloud(tuyaUid).catch((err) => {
      warnings.push(`资料刷新失败: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    if (!user) {
      user = await this.getByTuyaUid(tuyaUid);
    }

    let homes: TuyaUserHome[] = [];
    try {
      homes = await this.tuya.listUserHomes(tuyaUid);
    } catch (err) {
      warnings.push(`家庭列表失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    let cloudDevices: CloudDeviceRow[] = [];
    try {
      const devices = await this.tuya.listUserDevices(tuyaUid);
      cloudDevices = await this.annotateCloudDevices(devices);
    } catch (err) {
      warnings.push(`云端设备失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { user, homes, cloudDevices, warnings };
  }

  async refreshProfile(tuyaUid: string) {
    await this.getByTuyaUid(tuyaUid);
    const profile = await this.tuya.getUserProfile(tuyaUid);
    if (!profile) {
      const endUser = await this.getByTuyaUid(tuyaUid);
      return {
        user: endUser,
        refreshed: false,
        message: '云端未返回用户资料（当前项目权限下可能无手机号/昵称）',
      };
    }
    const updated = await this.persistProfile(tuyaUid, profile);
    const filled = Boolean(
      updated.username || updated.nickName || updated.mobile || updated.email,
    );
    return {
      user: updated,
      refreshed: true,
      message: filled
        ? '已刷新云端资料'
        : '云端接口有响应，但未包含用户名/昵称/手机号/邮箱',
    };
  }

  async listDevicesByTuyaUid(tuyaUid: string) {
    const endUser = await this.prisma.endUser.findUnique({
      where: { tuyaUid },
      include: {
        bindings: {
          include: { device: true },
        },
      },
    });

    if (!endUser) {
      throw new NotFoundException(`End user ${tuyaUid} not found`);
    }

    return endUser.bindings.map((binding) => binding.device);
  }

  async updateRemark(tuyaUid: string, remark: string | null | undefined) {
    const endUser = await this.prisma.endUser.findUnique({ where: { tuyaUid } });
    if (!endUser) {
      throw new NotFoundException(`End user ${tuyaUid} not found`);
    }
    return this.prisma.endUser.update({
      where: { tuyaUid },
      data: { remark: remark ?? null },
    });
  }

  private async applyProfileFromCloud(tuyaUid: string) {
    const profile = await this.tuya.getUserProfile(tuyaUid);
    if (!profile) return null;
    return this.persistProfile(tuyaUid, profile);
  }

  private async persistProfile(tuyaUid: string, profile: TuyaUserProfile) {
    const rawPayload: Record<string, unknown> = {
      ...(profile.raw ?? {}),
      ...(profile.userProperties ? { user_properties: profile.userProperties } : {}),
    };

    return this.prisma.endUser.update({
      where: { tuyaUid },
      data: {
        syncedAt: new Date(),
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
        raw: rawPayload as Prisma.InputJsonValue,
      },
    });
  }

  private async annotateCloudDevices(devices: TuyaUserDevice[]): Promise<CloudDeviceRow[]> {
    const ids = devices.map((d) => d.deviceId).filter(Boolean);
    const existing =
      ids.length === 0
        ? []
        : await this.prisma.device.findMany({
            where: { deviceId: { in: ids } },
            select: { deviceId: true },
          });
    const inConsole = new Set(existing.map((d) => d.deviceId));

    return devices.map((d) => ({
      ...d,
      inConsole: inConsole.has(d.deviceId),
      allowedProduct: true,
    }));
  }
}
