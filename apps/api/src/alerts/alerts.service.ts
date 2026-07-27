import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAlertsDto } from './dto/list-alerts.dto';

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

    return { items, total, page, pageSize };
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
}
