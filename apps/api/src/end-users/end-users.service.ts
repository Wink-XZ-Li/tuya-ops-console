import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TUYA_CLIENT, TuyaClient } from '../tuya/tuya.client';

export interface ListEndUsersParams {
  q?: string;
  page?: number;
  pageSize?: number;
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

  async refreshProfile(tuyaUid: string) {
    const endUser = await this.getByTuyaUid(tuyaUid);
    const profile = await this.tuya.getUserProfile(tuyaUid);
    if (!profile) {
      return {
        user: endUser,
        refreshed: false,
        message: '云端未返回用户资料（当前项目权限下可能无手机号/昵称）',
      };
    }
    const updated = await this.prisma.endUser.update({
      where: { tuyaUid },
      data: {
        ...(profile.username ? { username: profile.username } : {}),
        ...(profile.mobile ? { mobile: profile.mobile } : {}),
        ...(profile.email ? { email: profile.email } : {}),
        ...(profile.raw ? { raw: profile.raw as Prisma.InputJsonValue } : {}),
        syncedAt: new Date(),
      },
    });
    const filled = Boolean(updated.username || updated.mobile || updated.email);
    return {
      user: updated,
      refreshed: true,
      message: filled
        ? '已尝试刷新云端资料'
        : '云端接口有响应，但未包含用户名/手机号/邮箱',
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
}
