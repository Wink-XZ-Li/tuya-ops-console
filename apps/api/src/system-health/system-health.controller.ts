import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { listSystemHealthCatalog } from './system-health.catalog';
import { readSystemHealthConfig } from './system-health.config';
import { SystemHealthService } from './system-health.service';

@Controller('system-health')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SystemHealthController {
  constructor(private readonly systemHealth: SystemHealthService) {}

  @Get()
  @Roles('readonly', 'operator', 'admin')
  get() {
    return this.systemHealth.inspect();
  }

  @Post('check')
  @Roles('readonly', 'operator', 'admin')
  check(@Req() req: { user: { id: string } }) {
    return this.systemHealth.inspect({ auditUserId: req.user.id });
  }

  @Get('catalog')
  @Roles('readonly', 'operator', 'admin')
  catalog() {
    return { items: listSystemHealthCatalog(readSystemHealthConfig().groupId) };
  }
}
