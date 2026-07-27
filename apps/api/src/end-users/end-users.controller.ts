import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListEndUsersDto } from './dto/list-end-users.dto';
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

  @Get(':tuyaUid/devices')
  @Roles('readonly', 'operator', 'admin')
  listDevices(@Param('tuyaUid') tuyaUid: string) {
    return this.endUsersService.listDevicesByTuyaUid(tuyaUid);
  }
}
