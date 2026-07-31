import { Module } from '@nestjs/common';
import { AlertsModule } from './alerts/alerts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CommandsModule } from './commands/commands.module';
import { DevicesModule } from './devices/devices.module';
import { DpAliasesModule } from './dp-aliases/dp-aliases.module';
import { EndUsersModule } from './end-users/end-users.module';
import { KafkaModule } from './kafka/kafka.module';
import { SyncModule } from './sync/sync.module';
import { TuyaModule } from './tuya/tuya.module';

@Module({
  imports: [
    AuthModule,
    TuyaModule,
    AnalyticsModule,
    DevicesModule,
    EndUsersModule,
    KafkaModule,
    SyncModule,
    CommandsModule,
    DpAliasesModule,
    AlertsModule,
  ],
})
export class AppModule {}
