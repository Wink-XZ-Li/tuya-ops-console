import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAlertsDto } from './dto/list-alerts.dto';

type AlertTiming = {
  openedAt: Date;
  closedAt: Date | null;
  conditionStartedAt: Date | null;
};

export function alertDurationMinutes(alert: AlertTiming, now = new Date()): number {
  const start = alert.conditionStartedAt ?? alert.openedAt;
  const end = alert.closedAt ?? now;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAlertsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AlertWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { openedAt: 'desc' },
        include: {
          device: { select: { deviceId: true, name: true, productId: true } },
        },
      }),
      this.prisma.alert.count({ where }),
    ]);

    const labels = [
      ...new Set(items.map((alert) => alert.faultCode).filter((code): code is string => !!code)),
    ];
    const productIds = [
      ...new Set(
        items
          .map((alert) => alert.device?.productId)
          .filter((productId): productId is string => !!productId),
      ),
    ];
    const definitions =
      labels.length === 0 || productIds.length === 0
        ? []
        : await this.prisma.faultCodeDefinition.findMany({
            where: { code: 'fault', label: { in: labels }, productId: { in: productIds } },
            select: { productId: true, label: true, symptom: true, suggestedAction: true },
          });
    const copyOf = new Map(
      definitions.map((row) => [`${row.productId}\0${row.label}`, row]),
    );

    return {
      items: items.map((alert) => {
        const copy = alert.device?.productId && alert.faultCode
          ? copyOf.get(`${alert.device.productId}\0${alert.faultCode}`)
          : undefined;
        return {
          ...alert,
          durationMinutes: alertDurationMinutes(alert),
          symptom: copy?.symptom ?? null,
          suggestedAction: copy?.suggestedAction ?? null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async ack(alertId: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }
    if (alert.status === AlertStatus.closed) {
      return alert;
    }

    return this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.acked },
      include: {
        device: { select: { deviceId: true, name: true, productId: true } },
      },
    });
  }

  async close(alertId: string, adminUserId: string, reason?: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }
    if (alert.status === AlertStatus.closed) {
      return alert;
    }

    const closed = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.closed,
        closedAt: new Date(),
        closedReason: 'manual',
        activeKey: null,
      },
      include: {
        device: { select: { deviceId: true, name: true, productId: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        adminUserId,
        action: 'alert.close',
        resource: 'alert',
        detail: {
          alertId,
          deviceId: alert.deviceId,
          faultCode: alert.faultCode,
          reason: reason?.trim() || null,
        } as Prisma.InputJsonValue,
      },
    });

    return closed;
  }
}
