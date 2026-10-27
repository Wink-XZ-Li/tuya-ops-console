import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getProductDps } from '../devices/product-dp-schemas';
import { PrismaService } from '../prisma/prisma.service';
import { TUYA_CLIENT, TuyaClient } from '../tuya/tuya.client';

export interface SendCommandDto {
  code: string;
  value: unknown;
}

export interface ListCommandsParams {
  deviceId?: string;
  page?: number;
  pageSize?: number;
}

function mapSchemaType(type: string): string {
  const t = type.toLowerCase();
  if (t === 'bool' || t === 'boolean') return 'boolean';
  if (t === 'value') return 'integer';
  return t;
}

function instructionCodeSet(functions: Array<{ code?: string }>): Set<string> {
  return new Set(
    functions
      .map((fn) => fn.code)
      .filter((code): code is string => typeof code === 'string' && code.length > 0),
  );
}

@Injectable()
export class CommandsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TUYA_CLIENT) private readonly tuya: TuyaClient,
  ) {}

  async getFunctions(deviceId: string) {
    const device = await this.requireDevice(deviceId);
    const [standard, model, aliases] = await Promise.all([
      this.tuya.getStandardFunctions(deviceId).catch(() => []),
      this.tuya.getThingProperties(deviceId).catch(() => []),
      this.prisma.dpAlias.findMany({
        where: { productId: device.productId },
      }),
    ]);
    const aliasByCode = new Map(aliases.map((a) => [a.code, a]));
    const byCode = new Map<
      string,
      {
        code: string;
        name?: string;
        type?: string;
        values?: unknown;
        mode?: string;
        alias?: string;
        groupName?: string;
        sortOrder?: number;
      }
    >();

    for (const dp of getProductDps(device.productId)) {
      byCode.set(dp.code, {
        code: dp.code,
        name: dp.name,
        type: mapSchemaType(dp.type),
        values: dp.values ?? undefined,
        mode: dp.mode,
        sortOrder: dp.id,
      });
    }

    for (const dp of model) {
      const existing = byCode.get(dp.code);
      byCode.set(dp.code, {
        code: dp.code,
        name: dp.name ?? existing?.name,
        type: dp.type ?? existing?.type,
        values: dp.values ?? existing?.values,
        mode: dp.mode ?? existing?.mode,
        sortOrder: dp.dpId ?? existing?.sortOrder,
      });
    }

    for (const fn of standard) {
      const existing = byCode.get(fn.code);
      if (existing) {
        byCode.set(fn.code, {
          ...existing,
          name: existing.name ?? fn.name,
          type: existing.type ?? fn.type,
          values: existing.values ?? fn.values,
          mode: existing.mode ?? fn.mode ?? 'rw',
        });
        continue;
      }
      byCode.set(fn.code, {
        code: fn.code,
        name: fn.name,
        type: fn.type,
        values: fn.values,
        mode: fn.mode ?? 'rw',
      });
    }

    // 涂鸦标准指令集之外的属性只读。指令集内保留合并后的 mode（含原本的 ro）。
    const instructionCodes = instructionCodeSet(standard);

    return [...byCode.values()]
      .map((fn) => {
        const alias = aliasByCode.get(fn.code);
        return {
          ...fn,
          mode: instructionCodes.has(fn.code) ? fn.mode : 'ro',
          alias: alias?.alias,
          groupName: alias?.groupName ?? fn.groupName,
          sortOrder: alias?.sortOrder ?? fn.sortOrder,
        };
      })
      .sort(
        (a, b) =>
          (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.code.localeCompare(b.code),
      );
  }

  async send(deviceId: string, adminUserId: string, dto: SendCommandDto) {
    const device = await this.requireDevice(deviceId);
    await this.assertInStandardInstructionSet(deviceId, dto.code);

    let tuyaResponse: unknown;
    let success = false;
    try {
      tuyaResponse = await this.tuya.sendStandardCommand(deviceId, [
        { code: dto.code, value: dto.value },
      ]);
      success = true;
    } catch (error) {
      tuyaResponse = { error: String(error) };
    }

    await this.prisma.commandLog.create({
      data: {
        deviceId: device.id,
        adminUserId,
        productId: device.productId,
        code: dto.code,
        value: dto.value as Prisma.InputJsonValue,
        tuyaResponse: tuyaResponse as Prisma.InputJsonValue,
        success,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        adminUserId,
        action: 'device.command',
        resource: `device:${deviceId}`,
        detail: {
          code: dto.code,
          value: dto.value,
          success,
        } as Prisma.InputJsonValue,
      },
    });

    return { success, tuyaResponse };
  }

  async list(params: ListCommandsParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const where: Prisma.CommandLogWhereInput = {};

    if (params.deviceId) {
      const device = await this.prisma.device.findUnique({
        where: { deviceId: params.deviceId },
        select: { id: true },
      });
      if (!device) {
        throw new NotFoundException(`Device ${params.deviceId} not found`);
      }
      where.deviceId = device.id;
    }

    const [items, total] = await Promise.all([
      this.prisma.commandLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          device: { select: { deviceId: true, name: true } },
          adminUser: { select: { username: true } },
        },
      }),
      this.prisma.commandLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  private async assertInStandardInstructionSet(deviceId: string, code: string) {
    let functions: Array<{ code?: string }>;
    try {
      functions = await this.tuya.getStandardFunctions(deviceId);
    } catch {
      throw new BadRequestException(`无法获取设备标准指令集，已拒绝下发 ${code}`);
    }
    if (!instructionCodeSet(functions).has(code)) {
      throw new BadRequestException(`${code} 不在该设备标准指令集中，禁止下发`);
    }
  }

  private async requireDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    return device;
  }
}
