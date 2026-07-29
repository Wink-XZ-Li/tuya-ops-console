import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListEndUsersDto } from './dto/list-end-users.dto';
import { UpdateEndUserRemarkDto } from './dto/update-end-user-remark.dto';
import { EndUsersService } from './end-users.service';

@Controller('end-users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class EndUsersController {
  constructor(private readonly endUsersService: EndUsersService) {}

  @Get()
  @Roles('readonly', 'operator', 'admin')
  list(@Query() query: ListEndUsersDto) {
    return this.endUsersService.list(query);
  }

  @Get(':tuyaUid')
  @Roles('readonly', 'operator', 'admin')
  getOne(@Param('tuyaUid') tuyaUid: string) {
    return this.endUsersService.getByTuyaUid(tuyaUid);
  }

  @Get(':tuyaUid/cloud-snapshot')
  @Roles('readonly', 'operator', 'admin')
  cloudSnapshot(@Param('tuyaUid') tuyaUid: string) {
    return this.endUsersService.getCloudSnapshot(tuyaUid);
  }

  @Post(':tuyaUid/refresh-profile')
  @Roles('operator', 'admin')
  refreshProfile(@Param('tuyaUid') tuyaUid: string) {
    return this.endUsersService.refreshProfile(tuyaUid);
  }

  @Patch(':tuyaUid/remark')
  @Roles('operator', 'admin')
  updateRemark(@Param('tuyaUid') tuyaUid: string, @Body() body: UpdateEndUserRemarkDto) {
    return this.endUsersService.updateRemark(tuyaUid, body.remark);
  }

  @Get(':tuyaUid/devices')
  @Roles('readonly', 'operator', 'admin')
  listDevices(@Param('tuyaUid') tuyaUid: string) {
    return this.endUsersService.listDevicesByTuyaUid(tuyaUid);
  }
}
