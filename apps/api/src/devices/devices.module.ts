import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TuyaModule } from '../tuya/tuya.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [PrismaModule, AuthModule, TuyaModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
