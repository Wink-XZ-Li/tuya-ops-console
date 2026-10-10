import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { EventHandlerService } from './event-handler.service';
import { KafkaConsumer } from './kafka.consumer';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: EventHandlerService,
      useFactory: (prisma: PrismaService) =>
        new EventHandlerService(prisma),
      inject: [PrismaService],
    },
    KafkaConsumer,
  ],
})
export class KafkaModule {}
