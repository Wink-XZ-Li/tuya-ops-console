import { Module } from '@nestjs/common';
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
    DevicesModule,
    EndUsersModule,
    KafkaModule,
    SyncModule,
    CommandsModule,
    DpAliasesModule,
  ],
})
export class AppModule {}
