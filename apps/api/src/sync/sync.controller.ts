import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, MinLength } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SyncService } from './sync.service';

class ReconcileDeviceDto {
  @IsString()
  @MinLength(6)
  deviceId!: string;
}

@Controller('sync')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('reconcile')
  @Roles('admin')
  async reconcile(@Req() req: { user: { id: string } }) {
    try {
      return await this.syncService.reconcileAll(req.user.id);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }
  }

  @Post('reconcile-device')
  @Roles('admin')
  async reconcileDevice(
    @Req() req: { user: { id: string } },
    @Body() body: ReconcileDeviceDto,
  ) {
    try {
      return await this.syncService.reconcileDevice(req.user.id, body.deviceId);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }
  }
}
