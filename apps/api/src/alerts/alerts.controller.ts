import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AlertsService } from './alerts.service';
import { CloseAlertDto } from './dto/close-alert.dto';
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

  @Post(':id/close')
  @Roles('operator', 'admin')
  close(
    @Param('id') id: string,
    @Body() dto: CloseAlertDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.alertsService.close(id, req.user.id, dto.reason);
  }
}
