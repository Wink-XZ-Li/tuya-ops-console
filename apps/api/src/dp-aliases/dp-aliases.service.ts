import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertDpAliasDto {
  productId: string;
  code: string;
  alias: string;
  groupName?: string;
  sortOrder?: number;
}

export interface ListDpAliasesParams {
  productId?: string;
}

@Injectable()
export class DpAliasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListDpAliasesParams) {
    const where: Prisma.DpAliasWhereInput = {};
    if (params.productId) {
      where.productId = params.productId;
    }
    return this.prisma.dpAlias.findMany({
      where,
      orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async upsert(dto: UpsertDpAliasDto) {
    return this.prisma.dpAlias.upsert({
      where: {
        productId_code: { productId: dto.productId, code: dto.code },
      },
      update: {
        alias: dto.alias,
        groupName: dto.groupName,
        sortOrder: dto.sortOrder ?? 0,
      },
      create: {
        productId: dto.productId,
        code: dto.code,
        alias: dto.alias,
        groupName: dto.groupName,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.dpAlias.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`DpAlias ${id} not found`);
    }
    await this.prisma.dpAlias.delete({ where: { id } });
    return { id };
  }
}
