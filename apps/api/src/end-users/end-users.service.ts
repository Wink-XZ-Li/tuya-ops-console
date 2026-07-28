import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ListEndUsersParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class EndUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListEndUsersParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const where: Prisma.EndUserWhereInput = {};

    if (params.q) {
      where.OR = [
        { tuyaUid: { contains: params.q } },
        { username: { contains: params.q } },
        { mobile: { contains: params.q } },
        { email: { contains: params.q } },
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
