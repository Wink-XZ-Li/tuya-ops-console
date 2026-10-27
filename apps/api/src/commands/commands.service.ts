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

/** rw/wr 可下发。明确不含 w 的 mode（如 ro）只读。缺省视为可写，与状态集一致。 */
export function isWritableMode(mode?: string): boolean {
  if (mode == null || mode.trim() === '') return true;
  return mode.toLowerCase().includes('w');
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
          // 已有物模型或本地 schema 的 mode 优先，不用标准指令集覆盖成可写。
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

    // 可写性看物模型 accessMode / 本地 schema mode（rw 可下发，ro 只读）。
    // 不在标准指令集中的属性不再强制只读，否则壁挂炉 DP170～199 等工程参数无法下发。
    return [...byCode.values()]
      .map((fn) => {
        const alias = aliasByCode.get(fn.code);
        return {
          ...fn,
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
    await this.assertWritable(deviceId, dto.code);

    let tuyaResponse: unknown;
    let success = false;
    try {
      // 全部属性（标准指令与工程参数）统一走 IoT Core properties/issue。
      // 工程参数误下发会改变设备运行参数，与标准指令集 commands 不是同一条路径。
      tuyaResponse = await this.tuya.issueProperties(deviceId, {
        [dto.code]: dto.value,
      });
      success = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tuyaResponse = { error: message };
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

  private async assertWritable(deviceId: string, code: string) {
    const functions = await this.getFunctions(deviceId);
    const fn = functions.find((item) => item.code === code);
    if (!fn) {
      throw new BadRequestException(`${code} 不在该设备物模型或功能定义中，禁止下发`);
    }
    if (!isWritableMode(fn.mode)) {
      throw new BadRequestException(`${code} 为只读属性，禁止下发`);
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
