import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { OfflineRuleJob } from './offline-rule.job';
import { RetentionJob } from './retention.job';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AlertsController],
  providers: [AlertsService, OfflineRuleJob, RetentionJob],
})
export class AlertsModule {}
