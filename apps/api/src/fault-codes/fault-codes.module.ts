import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FaultCodeGroupsController } from './fault-code-groups.controller';
import { FaultCodeGroupsService } from './fault-code-groups.service';
import { FaultCodesController } from './fault-codes.controller';
import { FaultCodesService } from './fault-codes.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FaultCodesController, FaultCodeGroupsController],
  providers: [FaultCodesService, FaultCodeGroupsService],
  exports: [FaultCodesService, FaultCodeGroupsService],
})
export class FaultCodesModule {}
