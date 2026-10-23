import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DevicesService } from './devices.service';
import { ConnectivityQueryDto } from './dto/connectivity.dto';
import { DpTrendsQueryDto } from './dto/dp-trends.dto';
import { FaultHistoryQueryDto } from './dto/fault-history.dto';
import { UsageQueryDto } from './dto/usage.dto';
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

  @Get(':deviceId/cloud-logs')
  @Roles('readonly', 'operator', 'admin')
  cloudLogs(
    @Param('deviceId') deviceId: string,
    @Query('codes') codes?: string,
    @Query('hours') hours?: string,
    @Query('size') size?: string,
    @Query('lastRowKey') lastRowKey?: string,
    @Query('endTime') endTime?: string,
  ) {
    return this.devicesService.getCloudReportLogs(deviceId, {
      codes,
      hours: hours ? Number(hours) : undefined,
      size: size ? Number(size) : undefined,
      lastRowKey,
      endTime: endTime ? Number(endTime) : undefined,
    });
  }

  @Get(':deviceId/firmware')
  @Roles('readonly', 'operator', 'admin')
  firmware(@Param('deviceId') deviceId: string) {
    return this.devicesService.getFirmware(deviceId);
  }

  @Get(':deviceId/fault-history')
  @Roles('readonly', 'operator', 'admin')
  faultHistory(@Param('deviceId') deviceId: string, @Query() query: FaultHistoryQueryDto) {
    return this.devicesService.faultHistory(deviceId, query);
  }

  @Get(':deviceId/dp-trends')
  @Roles('readonly', 'operator', 'admin')
  dpTrends(@Param('deviceId') deviceId: string, @Query() query: DpTrendsQueryDto) {
    return this.devicesService.dpTrends(deviceId, query);
  }

  @Get(':deviceId/usage')
  @Roles('readonly', 'operator', 'admin')
  usage(@Param('deviceId') deviceId: string, @Query() query: UsageQueryDto) {
    return this.devicesService.usage(deviceId, query);
  }

  @Get(':deviceId/connectivity')
  @Roles('readonly', 'operator', 'admin')
  connectivity(@Param('deviceId') deviceId: string, @Query() query: ConnectivityQueryDto) {
    return this.devicesService.connectivity(deviceId, query);
  }

  @Get(':deviceId')
  @Roles('readonly', 'operator', 'admin')
  getOne(@Param('deviceId') deviceId: string) {
    return this.devicesService.getByDeviceId(deviceId);
  }
}
