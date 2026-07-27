import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { parseProductIds } from '../tuya/tuya.client';
import { EventHandlerService } from './event-handler.service';
import { KafkaConsumer } from './kafka.consumer';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: EventHandlerService,
      useFactory: (prisma: PrismaService) =>
        new EventHandlerService(prisma, parseProductIds()),
      inject: [PrismaService],
    },
    KafkaConsumer,
  ],
})
export class KafkaModule {}
