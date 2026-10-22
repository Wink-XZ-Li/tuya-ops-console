import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemHealthCollector } from './system-health.collector';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SystemHealthController],
  providers: [SystemHealthCollector, SystemHealthService],
})
export class SystemHealthModule {}
