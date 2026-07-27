import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isAllowedProduct,
  parseProductIds,
  TUYA_CLIENT,
  TuyaClient,
} from '../tuya/tuya.client';

export interface SendCommandDto {
  code: string;
  value: unknown;
}

export interface ListCommandsParams {
  deviceId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class CommandsService {
  private readonly allowedProducts = parseProductIds();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TUYA_CLIENT) private readonly tuya: TuyaClient,
  ) {}

  async getFunctions(deviceId: string) {
    const device = await this.requireDevice(deviceId);
    const [functions, aliases] = await Promise.all([
      this.tuya.getStandardFunctions(deviceId),
      this.prisma.dpAlias.findMany({
        where: { productId: device.productId },
      }),
    ]);
    const aliasByCode = new Map(aliases.map((a) => [a.code, a]));
    return functions.map((fn) => {
      const alias = aliasByCode.get(fn.code);
      return {
        ...fn,
        alias: alias?.alias,
        groupName: alias?.groupName,
        sortOrder: alias?.sortOrder,
      };
    });
  }

  async send(deviceId: string, adminUserId: string, dto: SendCommandDto) {
    const device = await this.requireDevice(deviceId);

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

  private async requireDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    if (!isAllowedProduct(device.productId, this.allowedProducts)) {
      throw new ForbiddenException(`Product ${device.productId} is not allowed`);
    }
    return device;
  }
}
