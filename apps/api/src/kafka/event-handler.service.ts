import { Injectable, Logger } from '@nestjs/common';
import { AlertStatus, DeviceOnlineStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isAllowedProduct } from '../tuya/tuya.client';
import { DeviceBusMessage } from './device-bus-message';

const ONLINE_CODES = new Set(['online', 'deviceOnline']);
const OFFLINE_CODES = new Set(['offline', 'deviceOffline']);
const PROPERTY_CODES = new Set([
  'property',
  'devicePropertyMessage',
  'devicePropertyChange',
]);
const BIND_CODES = new Set(['bindUser', 'deviceBindUser']);
const UNBIND_CODES = new Set(['unbindUser', 'deviceUnbindUser']);

const FAULT_CODE_PATTERN = /fault|alarm|error|warn|malfunction/i;

@Injectable()
export class EventHandlerService {
  private readonly logger = new Logger(EventHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allowedProducts: Set<string>,
  ) {}

  async handle(message: DeviceBusMessage): Promise<void> {
    const productId = await this.resolveProductId(message);
    if (!productId || !isAllowedProduct(productId, this.allowedProducts)) {
      return;
    }

    const eventTime = new Date(message.ts);
    const device = await this.prisma.device.upsert({
      where: { deviceId: message.deviceId },
      update: { productId, lastSeenAt: eventTime },
      create: {
        deviceId: message.deviceId,
        productId,
        lastSeenAt: eventTime,
      },
    });

    await this.prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        bizCode: message.bizCode,
        payload: message.payload as Prisma.InputJsonValue,
        eventTime,
      },
    });

    const bizCode = message.bizCode;
    if (ONLINE_CODES.has(bizCode)) {
      await this.handleOnline(device.id);
      return;
    }
    if (OFFLINE_CODES.has(bizCode)) {
      await this.handleOffline(device.id);
      return;
    }
    if (PROPERTY_CODES.has(bizCode)) {
      await this.handleProperty(device.id, message.payload);
      return;
    }
    if (BIND_CODES.has(bizCode)) {
      await this.handleBindUser(device.id, message.payload, eventTime);
      return;
    }
    if (UNBIND_CODES.has(bizCode)) {
      await this.handleUnbindUser(device.id, message.payload);
      return;
    }

    this.logger.debug(`Recorded unknown bizCode ${bizCode} for ${message.deviceId}`);
  }

  private async resolveProductId(message: DeviceBusMessage): Promise<string | undefined> {
    if (message.productId) {
      return message.productId;
    }
    const existing = await this.prisma.device.findUnique({
      where: { deviceId: message.deviceId },
      select: { productId: true },
    });
    return existing?.productId;
  }

  private async handleOnline(deviceId: string): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { onlineStatus: DeviceOnlineStatus.online },
    });
    await this.prisma.alert.updateMany({
      where: {
        deviceId,
        source: 'local_offline',
        status: { not: AlertStatus.closed },
      },
      data: { status: AlertStatus.closed, closedAt: new Date() },
    });
  }

  private async handleOffline(deviceId: string): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { onlineStatus: DeviceOnlineStatus.offline },
    });
  }

  private async handleProperty(
    deviceId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const updates = extractStatusUpdates(payload);
    if (Object.keys(updates).length === 0) {
      return;
    }

    const current = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { statusJson: true },
    });
    const merged = {
      ...asRecord(current?.statusJson),
      ...updates,
    };

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { statusJson: merged as Prisma.InputJsonValue },
    });

    if (hasFaultIndicators(updates)) {
      await this.prisma.alert.create({
        data: {
          deviceId,
          source: 'device',
          title: '设备上报故障/告警',
          detail: { properties: updates } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async handleBindUser(
    deviceId: string,
    payload: Record<string, unknown>,
    boundAt: Date,
  ): Promise<void> {
    const tuyaUid = String(payload.uid ?? payload.tuyaUid ?? '');
    if (!tuyaUid) {
      this.logger.warn(`bindUser missing uid for device ${deviceId}`);
      return;
    }

    const endUser = await this.prisma.endUser.upsert({
      where: { tuyaUid },
      update: {},
      create: { tuyaUid },
    });

    await this.prisma.deviceBinding.upsert({
      where: {
        deviceId_endUserId: { deviceId, endUserId: endUser.id },
      },
      update: { boundAt },
      create: { deviceId, endUserId: endUser.id, boundAt },
    });
  }

  private async handleUnbindUser(
    deviceId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const tuyaUid = String(payload.uid ?? payload.tuyaUid ?? '');
    if (!tuyaUid) {
      this.logger.warn(`unbindUser missing uid for device ${deviceId}`);
      return;
    }

    const endUser = await this.prisma.endUser.findUnique({ where: { tuyaUid } });
    if (!endUser) {
      return;
    }

    await this.prisma.deviceBinding.deleteMany({
      where: { deviceId, endUserId: endUser.id },
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractStatusUpdates(payload: Record<string, unknown>): Record<string, unknown> {
  const status = payload.status;
  if (Array.isArray(status)) {
    return status.reduce<Record<string, unknown>>((acc, item) => {
      if (item && typeof item === 'object' && 'code' in item) {
        const row = item as { code: string; value?: unknown };
        acc[row.code] = row.value;
      }
      return acc;
    }, {});
  }

  const properties = payload.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    return { ...(properties as Record<string, unknown>) };
  }

  const { status: _status, properties: _properties, ...rest } = payload;
  return rest;
}

function hasFaultIndicators(updates: Record<string, unknown>): boolean {
  return Object.entries(updates).some(([code, value]) => {
    if (FAULT_CODE_PATTERN.test(code)) {
      return true;
    }
    if (typeof value === 'boolean') {
      return value && FAULT_CODE_PATTERN.test(code);
    }
    if (typeof value === 'string') {
      return FAULT_CODE_PATTERN.test(value);
    }
    return false;
  });
}
