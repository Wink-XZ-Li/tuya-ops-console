import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FaultCodesController } from './fault-codes.controller';
import { FaultCodesService } from './fault-codes.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FaultCodesController],
  providers: [FaultCodesService],
  exports: [FaultCodesService],
})
export class FaultCodesModule {}
