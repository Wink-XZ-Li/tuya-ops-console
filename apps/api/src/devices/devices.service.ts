import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceOnlineStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TUYA_CLIENT, TuyaClient } from '../tuya/tuya.client';
import {
  asRecord,
  deriveFaultFields,
  deriveSignalStrength,
  statusFromPairs,
} from './device-derived';

export interface ListDevicesParams {
  q?: string;
  productId?: string;
  onlineStatus?: DeviceOnlineStatus;
  page?: number;
  pageSize?: number;
}

export interface ListDeviceEventsParams {
  bizCode?: string;
  /** Comma-separated bizCodes (IN filter). Takes precedence over bizCode when set. */
  bizCodes?: string;
  /** Comma-separated dpId / code list (OR match on payload). */
  dpId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TUYA_CLIENT) private readonly tuya: TuyaClient,
  ) {}

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
              select: {
                tuyaUid: true,
                username: true,
                mobile: true,
                email: true,
                remark: true,
              },
            },
          },
        },
        alerts: {
          where: { status: { not: 'closed' } },
          select: { id: true, title: true },
        },
      },
    });

    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    return this.toDetail(device);
  }

  /** Refresh OpenAPI status into statusJson + derived columns (detail page). */
  async refreshStatus(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const pairs = await this.tuya.getDeviceStatus(deviceId);
    const fromApi = statusFromPairs(pairs);
    // Merge so MQ-updated custom DPs are not wiped when OpenAPI returns a subset.
    const status = {
      ...asRecord(device.statusJson),
      ...fromApi,
    };
    const alerts = await this.prisma.alert.findMany({
      where: { deviceId: device.id, status: { not: 'closed' } },
      select: { title: true },
      take: 5,
    });
    const fault = deriveFaultFields(
      status,
      alerts.map((a) => a.title),
      device.productId,
    );

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        statusJson: status as Prisma.InputJsonValue,
        faultStatus: fault.faultStatus,
        faultInfo: fault.faultInfo,
        signalStrength: deriveSignalStrength(status),
        lastSeenAt: new Date(),
      },
    });

    return this.getByDeviceId(deviceId);
  }

  async listEvents(deviceId: string, params: ListDeviceEventsParams) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 100);
    const where: Prisma.DeviceEventWhereInput = { deviceId: device.id };

    const bizCodes = [
      ...(params.bizCodes
        ? params.bizCodes
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []),
      ...(params.bizCode ? [params.bizCode.trim()] : []),
    ];
    const uniqueBizCodes = [...new Set(bizCodes)];
    if (uniqueBizCodes.length === 1) {
      where.bizCode = uniqueBizCodes[0];
    } else if (uniqueBizCodes.length > 1) {
      where.bizCode = { in: uniqueBizCodes };
    }

    if (params.from || params.to) {
      where.eventTime = {};
      if (params.from) where.eventTime.gte = new Date(params.from);
      if (params.to) where.eventTime.lte = new Date(params.to);
    }

    const dpIds = [
      ...new Set(
        (params.dpId ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    // dpId filter needs payload scan — load a capped window then paginate in memory.
    if (dpIds.length) {
      if (!uniqueBizCodes.length) {
        where.bizCode = 'devicePropertyMessage';
      }
      const candidates = await this.prisma.deviceEvent.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        take: 500,
      });
      const filtered = candidates.filter((e) =>
        dpIds.some((id) => payloadMatchesDpId(e.payload, id)),
      );
      const total = filtered.length;
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);
      return {
        items: items.map((e) => ({
          id: e.id,
          bizCode: e.bizCode,
          payload: e.payload,
          eventTime: e.eventTime,
          createdAt: e.createdAt,
        })),
        total,
        page,
        pageSize,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.deviceEvent.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.deviceEvent.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        bizCode: e.bizCode,
        payload: e.payload,
        eventTime: e.eventTime,
        createdAt: e.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDetail(device: any) {
    return {
      deviceId: device.deviceId,
      productId: device.productId,
      name: device.name,
      onlineStatus: device.onlineStatus,
      statusJson: device.statusJson ?? {},
      faultStatus: device.faultStatus,
      faultInfo: device.faultInfo,
      lat: device.lat,
      lon: device.lon,
      locationText: device.locationText,
      signalStrength: device.signalStrength,
      lastSeenAt: device.lastSeenAt,
      bindings: device.bindings.map(
        (binding: {
          endUser: {
            tuyaUid: string;
            username: string | null;
            mobile: string | null;
            email: string | null;
            remark: string | null;
          };
        }) => ({
          tuyaUid: binding.endUser.tuyaUid,
          username: binding.endUser.username,
          mobile: binding.endUser.mobile,
          email: binding.endUser.email,
          remark: binding.endUser.remark,
        }),
      ),
      openAlertCount: device.alerts.length,
    };
  }
}

function payloadMatchesDpId(payload: unknown, dpId: string): boolean {
  const needle = dpId.trim().toLowerCase();
  if (!needle || payload == null || typeof payload !== 'object') {
    return false;
  }
  const root = payload as Record<string, unknown>;
  const buckets: unknown[] = [];
  if (Array.isArray(root.status)) buckets.push(...root.status);
  if (Array.isArray(root.properties)) buckets.push(...root.properties);
  if (Array.isArray(root.dps)) buckets.push(...root.dps);
  if (root.data && typeof root.data === 'object') {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.status)) buckets.push(...data.status);
  }

  for (const item of buckets) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const candidates = [row.dpId, row.dp_id, row.id, row.code, row.dpCode];
    if (candidates.some((c) => c != null && String(c).toLowerCase() === needle)) {
      return true;
    }
  }

  // Also allow matching object-map keys: { "1": true } or { switch_1: true }
  for (const key of Object.keys(root)) {
    if (key.toLowerCase() === needle) return true;
  }
  return false;
}
