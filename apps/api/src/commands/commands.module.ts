import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TuyaModule } from '../tuya/tuya.module';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';

@Module({
  imports: [PrismaModule, AuthModule, TuyaModule],
  controllers: [CommandsController],
  providers: [CommandsService],
})
export class CommandsModule {}
