import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka, KafkaMessage, logLevel } from 'kafkajs';
import { DeviceBusMessage } from './device-bus-message';
import { EventHandlerService } from './event-handler.service';

@Injectable()
export class KafkaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumer.name);
  private consumer: Consumer | null = null;
  private connected = false;

  constructor(private readonly eventHandler: EventHandlerService) {}

  async onModuleInit(): Promise<void> {
    // Do not block Nest listen() on Kafka join (can take tens of seconds).
    void this.startConsumer();
  }

  private async startConsumer(): Promise<void> {
    const brokers = (process.env.KAFKA_BROKERS ?? '127.0.0.1:19092')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);
    const topic = process.env.KAFKA_TOPIC_DEVICE_EVENTS ?? 'tuya.device.events';
    const groupId = process.env.KAFKA_GROUP_ID ?? 'tuya-ops-demo';

    const kafka = new Kafka({
      clientId: 'tuya-ops-api',
      brokers,
      logLevel: logLevel.WARN,
    });

    this.consumer = kafka.consumer({ groupId });

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic, fromBeginning: false });
      await this.consumer.run({
        eachMessage: async ({ message }: { message: KafkaMessage }) => {
          const raw = message.value?.toString();
          if (!raw) {
            this.logger.warn('Skipping Kafka message with empty value');
            return;
          }

          try {
            const parsed = JSON.parse(raw) as DeviceBusMessage;
            if (!parsed.deviceId || !parsed.bizCode || parsed.ts == null) {
              this.logger.warn(`Invalid DeviceBusMessage shape: ${raw}`);
              return;
            }
            await this.eventHandler.handle(parsed);
          } catch (err) {
            this.logger.error(`Failed to process Kafka message: ${raw}`, err);
          }
        },
      });

      this.connected = true;
      this.logger.log(`Kafka consumer subscribed to ${topic} (${groupId})`);
    } catch (err) {
      this.logger.error(
        `Kafka consumer failed to start (brokers=${brokers.join(',')}, topic=${topic}): Redpanda may be unavailable; API will continue without live device events`,
        err,
      );
      await this.safeDisconnect();
      this.consumer = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connected || !this.consumer) {
      return;
    }
    await this.safeDisconnect();
    this.consumer = null;
    this.connected = false;
  }

  private async safeDisconnect(): Promise<void> {
    if (!this.consumer) {
      return;
    }
    try {
      await this.consumer.disconnect();
    } catch (err) {
      this.logger.warn('Kafka consumer disconnect failed', err);
    }
  }
}
