import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { EndUsersModule } from './end-users/end-users.module';
import { KafkaModule } from './kafka/kafka.module';
import { TuyaModule } from './tuya/tuya.module';

@Module({
  imports: [AuthModule, TuyaModule, DevicesModule, EndUsersModule, KafkaModule],
})
export class AppModule {}
