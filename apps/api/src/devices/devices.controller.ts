import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DevicesService } from './devices.service';
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

  @Get(':deviceId')
  @Roles('readonly', 'operator', 'admin')
  getOne(@Param('deviceId') deviceId: string) {
    return this.devicesService.getByDeviceId(deviceId);
  }
}
