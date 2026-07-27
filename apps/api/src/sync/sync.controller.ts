import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SyncService } from './sync.service';

@Controller('sync')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('reconcile')
  @Roles('admin')
  reconcile(@Req() req: { user: { id: string } }) {
    return this.syncService.reconcileAll(req.user.id);
  }
}
