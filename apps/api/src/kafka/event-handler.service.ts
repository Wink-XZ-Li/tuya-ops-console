import { Injectable, Logger } from '@nestjs/common';
import { AlertStatus, DeviceOnlineStatus, Prisma } from '@prisma/client';
import { faultAlertActiveKey, offlineAlertActiveKey } from '../alerts/backfill-fault-alerts';
import { formatDeviceSoftCapWarning } from '../config/runtime-profile';
import {
  asRecord,
  decodeBitmapLabels,
  deriveFaultFields,
  deriveSignalStrength,
  extractStatusUpdates,
} from '../devices/device-derived';
import { PRODUCT_FAULT_BITMAP_LABELS } from '../devices/product-fault-schemas';
import { PrismaService } from '../prisma/prisma.service';
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

/** Recalibrate the approximate fleet size on this cadence. Not a second scheduler. */
const DEFAULT_COUNT_CALIBRATE_MS = 60_000;

type KnownDevice = { id: string; productId: string };

type PreparedEvent = {
  message: DeviceBusMessage;
  deviceId: string;
  eventTime: Date;
  event: {
    deviceId: string;
    bizCode: string;
    payload: Prisma.InputJsonValue;
    eventTime: Date;
  };
};

@Injectable()
export class EventHandlerService {
  private readonly logger = new Logger(EventHandlerService.name);
  private readonly knownDevices = new Map<string, KnownDevice>();
  /** Last calibrated device.count(), plus inserts observed since then. */
  private approxDeviceCount: number | null = null;
  private countCalibratedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async handle(message: DeviceBusMessage): Promise<void> {
    await this.handleMany([message]);
  }

  /**
   * Caller must pass messages in partition order. Device projection and alert
   * open/close stay sequential. Event rows for 2+ messages use one createMany.
   */
  async handleMany(messages: DeviceBusMessage[]): Promise<void> {
    const ready: PreparedEvent[] = [];
    for (const message of messages) {
      const prepared = await this.prepare(message);
      if (prepared) ready.push(prepared);
    }
    if (ready.length === 1) {
      await this.prisma.deviceEvent.create({ data: ready[0].event });
    } else if (ready.length > 1) {
      await this.prisma.deviceEvent.createMany({ data: ready.map((row) => row.event) });
    }
    for (const row of ready) {
      await this.dispatch(row.message, row.deviceId, row.eventTime);
    }
  }

  private async prepare(message: DeviceBusMessage): Promise<PreparedEvent | null> {
    const known = await this.lookup(message.deviceId);
    const productId = message.productId || known?.productId;
    if (!productId) return null;

    if (!known) {
      const count = await this.approximateDeviceCount();
      const warning = formatDeviceSoftCapWarning(
        count,
        process.env,
        `deviceId=${message.deviceId}`,
      );
      if (warning) this.logger.warn(warning);
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

    this.knownDevices.set(message.deviceId, { id: device.id, productId });
    if (!known && this.approxDeviceCount != null) {
      this.approxDeviceCount += 1;
    }

    return {
      message,
      deviceId: device.id,
      eventTime,
      event: {
        deviceId: device.id,
        bizCode: message.bizCode,
        payload: message.payload as Prisma.InputJsonValue,
        eventTime,
      },
    };
  }

  private async lookup(deviceId: string): Promise<KnownDevice | null> {
    const cached = this.knownDevices.get(deviceId);
    if (cached) return cached;
    const row = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true, productId: true },
    });
    if (!row?.id) return null;
    const known = { id: row.id, productId: row.productId ?? '' };
    if (known.productId) this.knownDevices.set(deviceId, known);
    return known;
  }

  private async approximateDeviceCount(): Promise<number> {
    const windowMs = readCountCalibrateMs();
    const now = Date.now();
    if (this.approxDeviceCount != null && now - this.countCalibratedAt < windowMs) {
      return this.approxDeviceCount;
    }
    const count = await this.prisma.device.count();
    this.approxDeviceCount = count;
    this.countCalibratedAt = now;
    return count;
  }

  private async dispatch(
    message: DeviceBusMessage,
    deviceId: string,
    eventTime: Date,
  ): Promise<void> {
    const bizCode = message.bizCode;
    if (ONLINE_CODES.has(bizCode)) {
      await this.handleOnline(deviceId);
      return;
    }
    if (OFFLINE_CODES.has(bizCode)) {
      await this.handleOffline(deviceId);
      return;
    }
    if (PROPERTY_CODES.has(bizCode)) {
      await this.handleProperty(deviceId, message.payload);
      return;
    }
    if (BIND_CODES.has(bizCode)) {
      await this.handleBindUser(deviceId, message.payload, eventTime);
      return;
    }
    if (UNBIND_CODES.has(bizCode)) {
      await this.handleUnbindUser(deviceId, message.payload);
      return;
    }
    this.logger.debug(`Recorded unknown bizCode ${bizCode} for ${message.deviceId}`);
  }

  private async handleOnline(deviceId: string): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { onlineStatus: DeviceOnlineStatus.online },
    });
    const now = new Date();
    await this.prisma.alert.updateMany({
      where: {
        deviceId,
        status: { not: AlertStatus.closed },
        OR: [
          { source: 'local_offline' },
          { category: 'connectivity', faultCode: 'offline' },
          { activeKey: offlineAlertActiveKey(deviceId) },
        ],
      },
      data: {
        status: AlertStatus.closed,
        closedAt: now,
        closedReason: 'online',
        activeKey: null,
      },
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
      select: { statusJson: true, productId: true },
    });
    const prev = asRecord(current?.statusJson);
    const merged = { ...prev, ...updates };
    const now = new Date();

    await this.reconcileFaultAlerts(deviceId, current?.productId, prev, merged, updates, now);

    const openFaultAlerts = await this.prisma.alert.findMany({
      where: { deviceId, status: { not: AlertStatus.closed }, category: 'fault' },
      select: { faultCode: true, title: true },
      take: 20,
    });
    const fault = deriveFaultFields(merged, {
      productId: current?.productId,
      openFaultAlerts,
    });

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        statusJson: merged as Prisma.InputJsonValue,
        faultStatus: fault.faultStatus,
        faultInfo: fault.faultInfo,
        signalStrength: deriveSignalStrength(merged),
      },
    });
  }

  private async reconcileFaultAlerts(
    deviceId: string,
    productId: string | null | undefined,
    prev: Record<string, unknown>,
    next: Record<string, unknown>,
    updates: Record<string, unknown>,
    now: Date,
  ): Promise<void> {
    const schemas = productId ? PRODUCT_FAULT_BITMAP_LABELS[productId] : undefined;
    if (!schemas) return;

    for (const [dpCode, labels] of Object.entries(schemas)) {
      const prevLabels = decodeBitmapLabels(prev[dpCode], labels);
      const nextLabels = decodeBitmapLabels(next[dpCode], labels);
      const prevSet = new Set(prevLabels);
      const nextSet = new Set(nextLabels);
      const touched = Object.prototype.hasOwnProperty.call(updates, dpCode);

      for (const label of nextLabels) {
        if (!prevSet.has(label) || touched) {
          await this.upsertActiveFaultAlert(deviceId, dpCode, label, next[dpCode], now);
        }
      }
      for (const label of prevLabels) {
        if (!nextSet.has(label)) {
          await this.clearFaultAlert(deviceId, dpCode, label, now);
        }
      }
    }
  }

  private async upsertActiveFaultAlert(
    deviceId: string,
    dpCode: string,
    label: string,
    value: unknown,
    now: Date,
  ): Promise<void> {
    const activeKey = faultAlertActiveKey(deviceId, dpCode, label);
    const existing = await this.prisma.alert.findUnique({ where: { activeKey } });
    if (existing) {
      await this.prisma.alert.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeenAt: now,
        },
      });
      return;
    }

    const data = {
      deviceId,
      source: 'device_fault',
      category: 'fault',
      faultCode: label,
      title: `故障 ${label}`,
      detail: { dpCode, label, value } as Prisma.InputJsonValue,
      conditionStartedAt: now,
      occurrenceCount: 1,
      lastSeenAt: now,
      activeKey,
      fingerprint: activeKey,
    };
    try {
      await this.prisma.alert.create({ data });
    } catch (err) {
      if (!isUniqueConflict(err)) throw err;
      await this.prisma.alert.update({
        where: { activeKey },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeenAt: now,
        },
      });
    }
  }

  private async clearFaultAlert(
    deviceId: string,
    dpCode: string,
    label: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.alert.updateMany({
      where: {
        activeKey: faultAlertActiveKey(deviceId, dpCode, label),
        status: { not: AlertStatus.closed },
      },
      data: {
        status: AlertStatus.closed,
        closedAt: now,
        closedReason: 'auto_clear',
        activeKey: null,
      },
    });
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

function isUniqueConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function readCountCalibrateMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DEVICE_COUNT_CALIBRATE_MS;
  if (raw == null || raw.trim() === '') return DEFAULT_COUNT_CALIBRATE_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_COUNT_CALIBRATE_MS;
  return value;
}
