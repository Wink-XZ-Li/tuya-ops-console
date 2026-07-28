import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DevicesService } from './devices.service';
import { ListDeviceEventsDto } from './dto/list-device-events.dto';
import { ListDevicesDto } from './dto/list-devices.dto';

@Controller('devices')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @Roles('readonly', 'operator', 'admin')
  list(@Query() query: ListDevicesDto) {
    return this.devicesService.list(query);
  }

  @Get(':deviceId/events')
  @Roles('readonly', 'operator', 'admin')
  listEvents(@Param('deviceId') deviceId: string, @Query() query: ListDeviceEventsDto) {
    return this.devicesService.listEvents(deviceId, query);
  }

  @Post(':deviceId/refresh-status')
  @Roles('readonly', 'operator', 'admin')
  refreshStatus(@Param('deviceId') deviceId: string) {
    return this.devicesService.refreshStatus(deviceId);
  }

  @Get(':deviceId')
  @Roles('readonly', 'operator', 'admin')
  getOne(@Param('deviceId') deviceId: string) {
    return this.devicesService.getByDeviceId(deviceId);
  }
}
