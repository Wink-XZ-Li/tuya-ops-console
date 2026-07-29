import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TuyaModule } from '../tuya/tuya.module';
import { EndUsersController } from './end-users.controller';
import { EndUsersService } from './end-users.service';

@Module({
  imports: [PrismaModule, AuthModule, TuyaModule],
  controllers: [EndUsersController],
  providers: [EndUsersService],
})
export class EndUsersModule {}
