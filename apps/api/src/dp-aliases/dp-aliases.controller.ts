import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DpAliasesService } from './dp-aliases.service';
import { ListDpAliasesDto } from './dto/list-dp-aliases.dto';
import { UpsertDpAliasDto } from './dto/upsert-dp-alias.dto';

@Controller('dp-aliases')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DpAliasesController {
  constructor(private readonly dpAliasesService: DpAliasesService) {}

  @Get()
  @Roles('readonly', 'operator', 'admin')
  list(@Query() query: ListDpAliasesDto) {
    return this.dpAliasesService.list(query);
  }

  @Put()
  @Roles('admin')
  upsert(@Body() dto: UpsertDpAliasDto) {
    return this.dpAliasesService.upsert(dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.dpAliasesService.remove(id);
  }
}
