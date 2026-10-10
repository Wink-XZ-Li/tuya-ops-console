import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @Roles('readonly', 'operator', 'admin')
  async dashboard(
    @Query('startDay') startDay?: string,
    @Query('endDay') endDay?: string,
    @Query('productId') productId?: string,
    @Query('refresh') refresh?: string,
  ) {
    const range = resolveDefaultRange(startDay, endDay);
    try {
      return await this.analytics.getDashboard({
        startDay: range.startDay,
        endDay: range.endDay,
        productId: productId?.trim() || undefined,
        refresh: refresh === '1' || refresh === 'true',
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  @Get('faults')
  @Roles('readonly', 'operator', 'admin')
  async faults(
    @Query('startDay') startDay?: string,
    @Query('endDay') endDay?: string,
    @Query('productId') productId?: string,
  ) {
    const range = resolveDefaultRange(startDay, endDay);
    try {
      return await this.analytics.getFaults({
        startDay: range.startDay,
        endDay: range.endDay,
        productId: productId?.trim() || undefined,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  @Get('devices-usage')
  @Roles('readonly', 'operator', 'admin')
  async devicesUsage(
    @Query('startDay') startDay?: string,
    @Query('endDay') endDay?: string,
    @Query('productId') productId?: string,
  ) {
    const range = resolveDefaultRange(startDay, endDay);
    try {
      return await this.analytics.getDevicesUsage({
        startDay: range.startDay,
        endDay: range.endDay,
        productId: productId?.trim() || undefined,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  @Get('users-insights')
  @Roles('readonly', 'operator', 'admin')
  async usersInsights(
    @Query('startDay') startDay?: string,
    @Query('endDay') endDay?: string,
    @Query('productId') productId?: string,
  ) {
    const range = resolveDefaultRange(startDay, endDay);
    try {
      return await this.analytics.getUsersInsights({
        startDay: range.startDay,
        endDay: range.endDay,
        productId: productId?.trim() || undefined,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  @Post('reports')
  @Roles('operator', 'admin')
  async createReport(
    @Req() req: { user: { id: string } },
    @Body()
    body: {
      template?: string;
      startDay?: string;
      endDay?: string;
      productId?: string;
      sections?: string[];
      name?: string;
    },
  ) {
    try {
      if (!body?.template) throw new Error('template 必填');
      if (!body?.startDay || !body?.endDay) throw new Error('startDay/endDay 必填');
      if (!Array.isArray(body.sections)) throw new Error('sections 必填（string[]）');
      return await this.analytics.createReport({
        template: body.template as 'week' | 'month' | 'custom',
        startDay: body.startDay,
        endDay: body.endDay,
        productId: body.productId?.trim() || undefined,
        sections: body.sections,
        name: body.name,
        createdByAdminUserId: req.user.id,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  @Get('reports')
  @Roles('readonly', 'operator', 'admin')
  async listReports(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    return this.analytics.listReports(Number.isFinite(n) ? n : 50);
  }

  @Get('reports/:id')
  @Roles('readonly', 'operator', 'admin')
  async getReport(@Param('id') id: string) {
    return this.analytics.getReport(id);
  }
}

function resolveDefaultRange(startDay?: string, endDay?: string): {
  startDay: string;
  endDay: string;
} {
  if (startDay?.trim() && endDay?.trim()) {
    return { startDay: startDay.trim(), endDay: endDay.trim() };
  }
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { startDay: formatYmd(start), endDay: formatYmd(end) };
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
