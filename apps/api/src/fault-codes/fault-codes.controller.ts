import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateFaultCodeDto } from './dto/create-fault-code.dto';
import { ListFaultCodesDto } from './dto/list-fault-codes.dto';
import { UpdateFaultCodeDto } from './dto/update-fault-code.dto';
import { FaultCodesService } from './fault-codes.service';

@Controller('fault-codes')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FaultCodesController {
  constructor(private readonly faultCodesService: FaultCodesService) {}

  @Get()
  @Roles('readonly', 'operator', 'admin')
  list(@Query() query: ListFaultCodesDto) {
    return this.faultCodesService.list(query);
  }

  @Get(':id')
  @Roles('readonly', 'operator', 'admin')
  get(@Param('id') id: string) {
    return this.faultCodesService.get(id);
  }

  @Post()
  @Roles('operator', 'admin')
  create(@Body() dto: CreateFaultCodeDto) {
    return this.faultCodesService.create(dto);
  }

  @Patch(':id')
  @Roles('operator', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateFaultCodeDto) {
    return this.faultCodesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('operator', 'admin')
  remove(@Param('id') id: string) {
    return this.faultCodesService.remove(id);
  }
}
