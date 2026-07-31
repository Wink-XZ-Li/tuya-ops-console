import {
  BadRequestException,
  Controller,
  Get,
  Query,
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
