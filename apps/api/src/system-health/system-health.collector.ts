import { Injectable, Logger } from '@nestjs/common';
import { Kafka, logLevel } from 'kafkajs';
import { connect as netConnect } from 'net';
import { PrismaService } from '../prisma/prisma.service';
import { readSystemHealthConfig } from './system-health.config';
import {
  consumerLag,
  parseBroker,
  sumHighWatermark,
  topicHasRecentMessages,
  type TopicEndOffset,
} from './system-health.kafka';
import type { ConsumerSnapshot, ProbeSignals, SystemHealthConfig } from './system-health.types';

const TCP_TIMEOUT_MS = 1500;
const KAFKA_TIMEOUT_MS = 4000;

@Injectable()
export class SystemHealthCollector {
  private readonly logger = new Logger(SystemHealthCollector.name);

  constructor(private readonly prisma: PrismaService) {}

  async collect(config: SystemHealthConfig = readSystemHealthConfig()): Promise<ProbeSignals> {
    const now = Date.now();
    const [mysql, kafka] = await Promise.all([
      this.probeMysql(),
      this.probeKafka(config, now),
    ]);
    return {
      now,
      demoMode: config.demoMode,
      ...mysql,
      ...kafka,
    };
  }

  private async probeMysql(): Promise<
    Pick<
      ProbeSignals,
      'mysqlOk' | 'mysqlLatencyMs' | 'deviceEventMaxAt' | 'deviceLastSeenMaxAt' | 'deviceCount'
    >
  > {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      this.logger.warn(`MySQL ping failed: ${errorMessage(err)}`);
      return {
        mysqlOk: false,
        mysqlLatencyMs: null,
        deviceEventMaxAt: null,
        deviceLastSeenMaxAt: null,
        deviceCount: 0,
      };
    }

    const mysqlLatencyMs = Date.now() - started;
    try {
      const [events, devices, deviceCount] = await Promise.all([
        this.prisma.deviceEvent.aggregate({ _max: { eventTime: true } }),
        this.prisma.device.aggregate({ _max: { lastSeenAt: true } }),
        this.prisma.device.count(),
      ]);
      return {
        mysqlOk: true,
        mysqlLatencyMs,
        deviceEventMaxAt: events._max.eventTime?.getTime() ?? null,
        deviceLastSeenMaxAt: devices._max.lastSeenAt?.getTime() ?? null,
        deviceCount,
      };
    } catch (err) {
      this.logger.warn(`Freshness query failed: ${errorMessage(err)}`);
      return {
        mysqlOk: false,
        mysqlLatencyMs,
        deviceEventMaxAt: null,
        deviceLastSeenMaxAt: null,
        deviceCount: 0,
      };
    }
  }

  private async probeKafka(
    config: SystemHealthConfig,
    now: number,
  ): Promise<Pick<ProbeSignals, 'kafkaReachable' | 'consumer'>> {
    const open = await anyBrokerOpen(config.brokers, TCP_TIMEOUT_MS);
    if (!open) {
      return { kafkaReachable: false, consumer: null };
    }

    try {
      const consumer = await withTimeout(this.inspectKafka(config, now), KAFKA_TIMEOUT_MS);
      return { kafkaReachable: true, consumer };
    } catch (err) {
      this.logger.warn(`Kafka probe failed: ${errorMessage(err)}`);
      return { kafkaReachable: false, consumer: null };
    }
  }

  private async inspectKafka(config: SystemHealthConfig, now: number): Promise<ConsumerSnapshot> {
    const kafka = new Kafka({
      clientId: 'tuya-ops-system-health',
      brokers: config.brokers,
      connectionTimeout: 2000,
      requestTimeout: 2000,
      logLevel: logLevel.NOTHING,
      retry: { retries: 1, initialRetryTime: 150, maxRetryTime: 300 },
    });
    const admin = kafka.admin();
    let connected = false;
    try {
      await admin.connect();
      connected = true;

      const described = await admin.describeGroups([config.groupId]);
      const group = described.groups[0];
      const state = group?.state ?? null;
      const memberCount = group?.members?.length ?? 0;

      let ends: TopicEndOffset[] = [];
      let topicHasRecentMessage: boolean | null = null;
      try {
        const topicEnds = await admin.fetchTopicOffsets(config.topic);
        ends = topicEnds.map((row) => ({
          partition: row.partition,
          high: row.high,
          low: row.low,
        }));
        const byTimestamp = await admin.fetchTopicOffsetsByTimestamp(
          config.topic,
          now - config.staleEventMs,
        );
        topicHasRecentMessage = topicHasRecentMessages(ends, byTimestamp);
      } catch (err) {
        this.logger.warn(`Kafka topic offsets unavailable: ${errorMessage(err)}`);
        topicHasRecentMessage = null;
      }

      let lag: number | null = null;
      if (ends.length > 0) {
        try {
          const committed = await admin.fetchOffsets({
            groupId: config.groupId,
            topics: [config.topic],
            resolveOffsets: false,
          });
          const parts =
            committed.find((topic) => topic.topic === config.topic)?.partitions ?? [];
          lag = consumerLag(
            ends,
            parts.map((part) => ({ partition: part.partition, offset: part.offset })),
          );
        } catch (err) {
          this.logger.warn(`Kafka committed offsets unavailable: ${errorMessage(err)}`);
          lag = consumerLag(ends, []);
        }
      }

      return {
        state,
        memberCount,
        lag,
        highWatermark: ends.length > 0 ? sumHighWatermark(ends) : null,
        topicHasRecentMessage,
      };
    } finally {
      if (connected) {
        await admin.disconnect().catch(() => undefined);
      }
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('system health kafka probe timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function anyBrokerOpen(brokers: string[], timeoutMs: number): Promise<boolean> {
  const parsed = brokers
    .map(parseBroker)
    .filter((item): item is { host: string; port: number } => item != null);
  if (parsed.length === 0) return Promise.resolve(false);
  return Promise.all(parsed.map((broker) => tcpOpen(broker.host, broker.port, timeoutMs))).then(
    (results) => results.some(Boolean),
  );
}

function tcpOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = netConnect({ host, port });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
