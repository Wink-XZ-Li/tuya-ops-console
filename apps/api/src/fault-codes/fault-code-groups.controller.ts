import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateFaultCodeGroupDto } from './dto/create-fault-code-group.dto';
import { UpdateFaultCodeGroupDto } from './dto/update-fault-code-group.dto';
import { FaultCodeGroupsService } from './fault-code-groups.service';

@Controller('fault-code-groups')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FaultCodeGroupsController {
  constructor(private readonly groups: FaultCodeGroupsService) {}

  @Get()
  @Roles('readonly', 'operator', 'admin')
  list() {
    return this.groups.list();
  }

  @Get(':id')
  @Roles('readonly', 'operator', 'admin')
  get(@Param('id') id: string) {
    return this.groups.get(id);
  }

  @Post()
  @Roles('operator', 'admin')
  create(@Body() dto: CreateFaultCodeGroupDto) {
    return this.groups.create(dto);
  }

  @Patch(':id')
  @Roles('operator', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateFaultCodeGroupDto) {
    return this.groups.update(id, dto);
  }
}
