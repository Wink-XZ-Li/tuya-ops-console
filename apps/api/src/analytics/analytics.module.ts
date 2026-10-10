import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TuyaModule } from '../tuya/tuya.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RollupJob } from './rollup.job';

@Module({
  imports: [AuthModule, TuyaModule, PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RollupJob],
  exports: [AnalyticsService, RollupJob],
})
export class AnalyticsModule {}
