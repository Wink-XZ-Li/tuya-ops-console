import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TuyaModule } from '../tuya/tuya.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AuthModule, TuyaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
