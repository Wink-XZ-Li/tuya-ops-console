import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFaultCodeGroupDto, FaultCodeGroupCodeDto } from './dto/create-fault-code-group.dto';
import { UpdateFaultCodeGroupDto } from './dto/update-fault-code-group.dto';
import {
  clusterBySignature,
  DictionaryCode,
  ensureFaultCodeGroups,
  incompatibleBitmapMessage,
  suggestGroupName,
} from './fault-code-groups';

export type FaultCodeGroupView = {
  id: string;
  name: string;
  productIds: string[];
  codes: Array<DictionaryCode & { id: string }>;
};

const groupInclude = { members: true, codes: true } satisfies Prisma.FaultCodeGroupInclude;

type GroupRecord = Prisma.FaultCodeGroupGetPayload<{ include: typeof groupInclude }>;

@Injectable()
export class FaultCodeGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<FaultCodeGroupView[]> {
    await ensureFaultCodeGroups(this.prisma);
    const groups = await this.prisma.faultCodeGroup.findMany({
      include: groupInclude,
      orderBy: { name: 'asc' },
    });
    return groups.map(toView);
  }

  async get(id: string): Promise<FaultCodeGroupView> {
    return toView(await this.findGroup(id));
  }

  async create(dto: CreateFaultCodeGroupDto): Promise<FaultCodeGroupView> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('故障组名称不能为空');
    const productIds = uniqueIds(dto.productIds);
    const codes = dto.codes ? normalizeCodes(dto.codes) : await this.codesFromProducts(productIds);
    this.assertMembersFit(productIds, codes);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.detach(tx, productIds);
      const group = await tx.faultCodeGroup.create({
        data: {
          name: name.slice(0, 128),
          members: { create: productIds.map((productId) => ({ productId })) },
          codes: { create: codes.map(codeData) },
        },
        include: groupInclude,
      });
      for (const productId of productIds) {
        await materialize(tx, productId, codes);
      }
      return group;
    });
    return toView(created);
  }

  async update(id: string, dto: UpdateFaultCodeGroupDto): Promise<FaultCodeGroupView> {
    const existing = await this.findGroup(id);
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('故障组名称不能为空');
    const currentIds = existing.members.map((member) => member.productId);
    const productIds = dto.productIds ? uniqueIds(dto.productIds) : currentIds;
    let codes = dto.codes
      ? normalizeCodes(dto.codes)
      : existing.codes.map(toDictionaryCode);
    if (!dto.codes && codes.length === 0 && productIds.length > 0) {
      codes = await this.codesFromProducts(productIds);
    }
    this.assertMembersFit(productIds, codes);
    const removed = currentIds.filter((productId) => !productIds.includes(productId));
    const added = productIds.filter((productId) => !currentIds.includes(productId));
    const staying = productIds.filter((productId) => currentIds.includes(productId));
    const replaceCodes =
      dto.codes !== undefined || (existing.codes.length === 0 && codes.length > 0);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.faultCodeGroup.update({
        where: { id },
        data: { name: name ? name.slice(0, 128) : undefined },
      });
      if (replaceCodes) {
        await tx.faultCodeGroupCode.deleteMany({ where: { groupId: id } });
        if (codes.length > 0) {
          await tx.faultCodeGroupCode.createMany({
            data: codes.map((code) => ({ groupId: id, ...codeData(code) })),
          });
        }
      }
      if (removed.length > 0) {
        await tx.faultCodeGroupMember.deleteMany({
          where: { groupId: id, productId: { in: removed } },
        });
        for (const productId of removed) {
          await splitOff(tx, productId);
        }
      }
      if (added.length > 0) {
        await this.detach(tx, added, id);
        await tx.faultCodeGroupMember.createMany({
          data: added.map((productId) => ({ groupId: id, productId })),
        });
      }
      const touched = replaceCodes ? [...staying, ...added] : added;
      for (const productId of touched) {
        await materialize(tx, productId, codes);
      }
      return tx.faultCodeGroup.findUniqueOrThrow({ where: { id }, include: groupInclude });
    });
    return toView(updated);
  }

  private async findGroup(id: string): Promise<GroupRecord> {
    const group = await this.prisma.faultCodeGroup.findUnique({
      where: { id },
      include: groupInclude,
    });
    if (!group) throw new NotFoundException(`故障组 ${id} 不存在`);
    return group;
  }

  private assertMembersFit(productIds: string[], codes: DictionaryCode[]) {
    if (codes.length === 0) return;
    for (const productId of productIds) {
      const message = incompatibleBitmapMessage(productId, codes);
      if (message) throw new BadRequestException(message);
    }
  }

  private async codesFromProducts(productIds: string[]): Promise<DictionaryCode[]> {
    if (productIds.length === 0) return [];
    const rows = await this.prisma.faultCodeDefinition.findMany({
      where: { productId: { in: productIds } },
    });
    const clusters = clusterBySignature(
      productIds.map((productId) => ({
        productId,
        codes: rows.filter((row) => row.productId === productId).map(toDictionaryCode),
      })),
    );
    const withCodes = clusters.filter((cluster) => cluster.codes.length > 0);
    if (withCodes.length > 1) {
      throw new BadRequestException('这些产品的故障字典不一致，不能放进同一组');
    }
    return withCodes[0]?.codes ?? [];
  }

  private async detach(tx: Prisma.TransactionClient, productIds: string[], keepGroupId?: string) {
    if (productIds.length === 0) return;
    await tx.faultCodeGroupMember.deleteMany({
      where: {
        productId: { in: productIds },
        ...(keepGroupId ? { groupId: { not: keepGroupId } } : {}),
      },
    });
  }
}

function uniqueIds(ids?: string[]): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}

function toView(group: GroupRecord): FaultCodeGroupView {
  return {
    id: group.id,
    name: group.name,
    productIds: group.members.map((member) => member.productId).sort(),
    codes: [...group.codes].sort(compareCodes).map((code) => ({
      id: code.id,
      ...toDictionaryCode(code),
    })),
  };
}

function toDictionaryCode(row: {
  code: string;
  label: string;
  sortOrder: number;
  symptom: string | null;
  cause: string | null;
  suggestedAction: string | null;
  countInQualityRate: boolean;
  notifyAftersales: boolean;
}): DictionaryCode {
  return {
    code: row.code,
    label: row.label,
    sortOrder: row.sortOrder,
    symptom: row.symptom,
    cause: row.cause,
    suggestedAction: row.suggestedAction,
    countInQualityRate: row.countInQualityRate,
    notifyAftersales: row.notifyAftersales,
  };
}

function normalizeCodes(codes: FaultCodeGroupCodeDto[]): DictionaryCode[] {
  const seen = new Set<string>();
  return codes.map((code) => {
    const key = `${code.code}\0${code.label}`;
    if (seen.has(key)) {
      throw new BadRequestException(`故障码 ${code.code}/${code.label} 重复`);
    }
    seen.add(key);
    return {
      code: code.code,
      label: code.label,
      sortOrder: code.sortOrder,
      symptom: code.symptom ?? null,
      cause: code.cause ?? null,
      suggestedAction: code.suggestedAction ?? null,
      countInQualityRate: code.countInQualityRate ?? true,
      notifyAftersales: code.notifyAftersales ?? false,
    };
  });
}

function codeData(code: DictionaryCode): Prisma.FaultCodeGroupCodeCreateWithoutGroupInput {
  return {
    code: code.code,
    label: code.label,
    sortOrder: code.sortOrder,
    symptom: code.symptom,
    cause: code.cause,
    suggestedAction: code.suggestedAction,
    countInQualityRate: code.countInQualityRate,
    notifyAftersales: code.notifyAftersales,
  };
}

function compareCodes(a: DictionaryCode, b: DictionaryCode): number {
  return a.code.localeCompare(b.code) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
}

async function materialize(tx: Prisma.TransactionClient, productId: string, codes: DictionaryCode[]) {
  for (const code of codes) {
    await tx.faultCodeDefinition.upsert({
      where: {
        productId_code_label: { productId, code: code.code, label: code.label },
      },
      create: { productId, ...codeData(code) },
      update: codeData(code),
    });
  }
}

async function splitOff(tx: Prisma.TransactionClient, productId: string) {
  const rows = await tx.faultCodeDefinition.findMany({ where: { productId } });
  if (rows.length === 0) return;
  const codes = rows.map(toDictionaryCode);
  await tx.faultCodeGroup.create({
    data: {
      name: suggestGroupName([productId], codes).slice(0, 128),
      members: { create: [{ productId }] },
      codes: { create: codes.map(codeData) },
    },
  });
}
