import { Injectable, NotFoundException } from '@nestjs/common';
import { DeviceOnlineStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ListDevicesParams {
  q?: string;
  productId?: string;
  onlineStatus?: DeviceOnlineStatus;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListDevicesParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const where: Prisma.DeviceWhereInput = {};

    if (params.productId) {
      where.productId = params.productId;
    }
    if (params.onlineStatus) {
      where.onlineStatus = params.onlineStatus;
    }
    if (params.q) {
      where.OR = [
        { deviceId: { contains: params.q } },
        { name: { contains: params.q } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.device.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getByDeviceId(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      include: {
        bindings: {
          include: {
            endUser: {
              select: { tuyaUid: true, username: true, mobile: true },
            },
          },
        },
        alerts: {
          where: { status: { not: 'closed' } },
          select: { id: true },
        },
      },
    });

    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    return {
      deviceId: device.deviceId,
      productId: device.productId,
      name: device.name,
      onlineStatus: device.onlineStatus,
      statusJson: device.statusJson,
      bindings: device.bindings.map((binding) => ({
        tuyaUid: binding.endUser.tuyaUid,
        username: binding.endUser.username,
        mobile: binding.endUser.mobile,
      })),
      openAlertCount: device.alerts.length,
    };
  }
}
