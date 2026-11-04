import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, EachBatchPayload, Kafka, logLevel } from 'kafkajs';
import { EventHandlerService } from './event-handler.service';
import {
  KAFKA_MESSAGE_RETRY_POLICY,
  consumePartitionBatch,
  readHandlerBatchSize,
  readMessageAttempts,
  readPartitionConcurrency,
  readRetryDelayMs,
} from './kafka-batch';

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
    const partitionsConsumedConcurrently = readPartitionConcurrency();

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
        autoCommit: true,
        autoCommitThreshold: 1,
        eachBatchAutoResolve: false,
        partitionsConsumedConcurrently,
        eachBatch: async (payload) => {
          await this.handleBatch(payload);
        },
      });

      this.connected = true;
      this.logger.log(
        `Kafka consumer subscribed to ${topic} (${groupId}); partitionsConsumedConcurrently=${partitionsConsumedConcurrently}; ${KAFKA_MESSAGE_RETRY_POLICY}`,
      );
    } catch (err) {
      this.logger.error(
        `Kafka consumer failed to start (brokers=${brokers.join(',')}, topic=${topic}): Redpanda may be unavailable; API will continue without live device events`,
        err,
      );
      await this.safeDisconnect();
      this.consumer = null;
    }
  }

  private async handleBatch(payload: EachBatchPayload): Promise<void> {
    const { batch } = payload;
    const result = await consumePartitionBatch(
      batch.messages.map((message) => ({
        offset: message.offset,
        value: message.value,
      })),
      {
        handleMany: (messages) => this.eventHandler.handleMany(messages),
        maxAttempts: readMessageAttempts(),
        retryDelayMs: readRetryDelayMs(),
        batchSize: readHandlerBatchSize(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        warn: (message) =>
          this.logger.warn(`partition=${batch.partition} ${message}`),
        error: (message, err) =>
          this.logger.error(`partition=${batch.partition} ${message}`, err),
        isRunning: payload.isRunning,
        isStale: payload.isStale,
        heartbeat: () => payload.heartbeat(),
      },
    );

    for (const offset of result.resolvedOffsets) {
      payload.resolveOffset(offset);
    }
    const pending = payload.uncommittedOffsets();
    if (pending.topics.length > 0) {
      await payload.commitOffsetsIfNecessary(pending);
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
