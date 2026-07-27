import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AlertsService } from './alerts.service';
import { ListAlertsDto } from './dto/list-alerts.dto';

@Controller('alerts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles('readonly', 'operator', 'admin')
  list(@Query() query: ListAlertsDto) {
    return this.alertsService.list(query);
  }

  @Post(':id/ack')
  @Roles('operator', 'admin')
  ack(@Param('id') id: string) {
    return this.alertsService.ack(id);
  }
}
