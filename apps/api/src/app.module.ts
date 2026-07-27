import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TuyaModule } from './tuya/tuya.module';

@Module({
  imports: [AuthModule, TuyaModule],
})
export class AppModule {}
