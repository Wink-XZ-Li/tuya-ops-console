import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DpAliasesController } from './dp-aliases.controller';
import { DpAliasesService } from './dp-aliases.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DpAliasesController],
  providers: [DpAliasesService],
})
export class DpAliasesModule {}
