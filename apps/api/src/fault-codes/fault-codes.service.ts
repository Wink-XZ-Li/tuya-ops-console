import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FaultCodeDefinition, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFaultCodeDto } from './dto/create-fault-code.dto';
import { ListFaultCodesDto } from './dto/list-fault-codes.dto';
import { UpdateFaultCodeDto } from './dto/update-fault-code.dto';
import {
  bitmapSlot,
  WATER_HEATER_LABEL_ORDER,
  WATER_HEATER_PRODUCT_ID,
} from './fault-code-catalog';

@Injectable()
export class FaultCodesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ListFaultCodesDto): Promise<FaultCodeDefinition[]> {
    const where: Prisma.FaultCodeDefinitionWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.code) where.code = query.code;
    if (query.label) where.label = query.label;
    return this.prisma.faultCodeDefinition.findMany({
      where,
      orderBy: [{ productId: 'asc' }, { code: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async get(id: string): Promise<FaultCodeDefinition> {
    const row = await this.prisma.faultCodeDefinition.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`故障码 ${id} 不存在`);
    return row;
  }

  async create(dto: CreateFaultCodeDto): Promise<FaultCodeDefinition> {
    const sortOrder = this.resolveCreateSortOrder(dto);
    try {
      return await this.prisma.faultCodeDefinition.create({
        data: {
          productId: dto.productId,
          code: dto.code,
          label: dto.label,
          sortOrder,
          symptom: dto.symptom ?? null,
          cause: dto.cause ?? null,
          suggestedAction: dto.suggestedAction ?? null,
          countInQualityRate: dto.countInQualityRate ?? true,
          notifyAftersales: dto.notifyAftersales ?? false,
        },
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException(`故障码 ${dto.productId}/${dto.code}/${dto.label} 已存在`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateFaultCodeDto): Promise<FaultCodeDefinition> {
    const existing = await this.get(id);
    if (dto.sortOrder !== undefined) {
      this.assertSortOrder(existing.productId, existing.code, existing.label, dto.sortOrder);
    }
    const data: Prisma.FaultCodeDefinitionUpdateInput = {};
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.symptom !== undefined) data.symptom = dto.symptom;
    if (dto.cause !== undefined) data.cause = dto.cause;
    if (dto.suggestedAction !== undefined) data.suggestedAction = dto.suggestedAction;
    if (typeof dto.countInQualityRate === 'boolean') {
      data.countInQualityRate = dto.countInQualityRate;
    }
    if (typeof dto.notifyAftersales === 'boolean') {
      data.notifyAftersales = dto.notifyAftersales;
    }
    if (Object.keys(data).length === 0) return existing;
    return this.prisma.faultCodeDefinition.update({ where: { id }, data });
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.get(id);
    const slot = bitmapSlot(existing.productId, existing.code, existing.label);
    if (slot.kind === 'locked') {
      throw new BadRequestException(this.deleteMessage(existing.productId, existing.label));
    }
    await this.prisma.faultCodeDefinition.delete({ where: { id } });
    return { id };
  }

  private resolveCreateSortOrder(dto: CreateFaultCodeDto): number {
    const slot = bitmapSlot(dto.productId, dto.code, dto.label);
    if (slot.kind === 'rejected') {
      throw new BadRequestException(this.unknownLabelMessage(dto.productId, dto.code, dto.label));
    }
    if (slot.kind === 'free') return dto.sortOrder ?? 0;
    if (dto.sortOrder !== undefined && dto.sortOrder !== slot.index) {
      throw new BadRequestException(
        this.orderMessage(dto.productId, dto.label, slot.index, dto.sortOrder),
      );
    }
    return slot.index;
  }

  private assertSortOrder(productId: string, code: string, label: string, sortOrder: number) {
    const slot = bitmapSlot(productId, code, label);
    if (slot.kind === 'locked' && sortOrder !== slot.index) {
      throw new BadRequestException(this.orderMessage(productId, label, slot.index, sortOrder));
    }
  }

  private orderMessage(productId: string, label: string, index: number, requested: number): string {
    if (productId === WATER_HEATER_PRODUCT_ID) {
      return `热水器 ${WATER_HEATER_PRODUCT_ID} 的故障码顺序必须保持 ${WATER_HEATER_LABEL_ORDER.join(
        ',',
      )}，不能把 ${label} 的 sortOrder 从位图序号 ${index} 改成 ${requested}`;
    }
    return `位图故障码 ${label} 的 sortOrder 必须为 ${index}，不能改成 ${requested}`;
  }

  private unknownLabelMessage(productId: string, code: string, label: string): string {
    if (productId === WATER_HEATER_PRODUCT_ID) {
      return `不能为热水器 ${WATER_HEATER_PRODUCT_ID} 新增位图之外的故障码 ${code}/${label}，顺序必须保持 ${WATER_HEATER_LABEL_ORDER.join(
        ',',
      )}`;
    }
    return `不能新增位图未定义的故障码 ${productId}/${code}/${label}`;
  }

  private deleteMessage(productId: string, label: string): string {
    if (productId === WATER_HEATER_PRODUCT_ID) {
      return `不能删除热水器 ${WATER_HEATER_PRODUCT_ID} 位图已定义的故障码 ${label}，顺序必须保持 ${WATER_HEATER_LABEL_ORDER.join(
        ',',
      )}`;
    }
    return `不能删除位图已定义的故障码 ${productId}/${label}`;
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
