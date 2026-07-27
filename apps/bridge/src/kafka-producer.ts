import { Kafka, logLevel, Producer, ProducerRecord } from 'kafkajs';
import { DeviceBusMessage } from './device-bus-message';

export type KafkaProducerConfig = {
  brokers: string[];
  topic: string;
};

export class DeviceEventKafkaProducer {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private connected = false;

  constructor(private readonly config: KafkaProducerConfig) {
    this.kafka = new Kafka({
      clientId: 'tuya-ops-bridge',
      brokers: config.brokers,
      logLevel: logLevel.WARN,
    });
  }

  async connect(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.connected = true;
  }

  async send(message: DeviceBusMessage): Promise<void> {
    if (!this.producer || !this.connected) {
      throw new Error('Kafka producer is not connected');
    }

    const record: ProducerRecord = {
      topic: this.config.topic,
      messages: [
        {
          key: message.deviceId,
          value: JSON.stringify(message),
        },
      ],
    };
    await this.producer.send(record);
  }

  async disconnect(): Promise<void> {
    if (!this.producer || !this.connected) {
      return;
    }
    await this.producer.disconnect();
    this.producer = null;
    this.connected = false;
  }
}

export function parseBrokers(raw = process.env.KAFKA_BROKERS ?? '127.0.0.1:19092'): string[] {
  return raw
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
}
