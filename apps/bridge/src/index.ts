import { DeviceBusMessage } from './device-bus-message';
import { DeviceEventKafkaProducer, parseBrokers } from './kafka-producer';
import { loadRootEnv } from './load-env';
import { TuyaPulsarConsumer } from './pulsar';

loadRootEnv();

const DEFAULT_PRODUCT_IDS = [
  'uhmj5b0ba31zpme6',
  'qxjzruuqz40bty7e',
  'nohrp3vbmef7vxvx',
];

function parseAllowedProducts(raw = process.env.TUYA_PRODUCT_IDS ?? ''): Set<string> {
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return new Set(ids.length > 0 ? ids : DEFAULT_PRODUCT_IDS);
}

function isAllowedProduct(productId: string | undefined, allowed: Set<string>): boolean {
  return Boolean(productId && allowed.has(productId));
}

async function main(): Promise<void> {
  const demoMode = process.env.DEMO_MODE ?? 'mock';
  if (demoMode !== 'live') {
    console.log(`DEMO_MODE=${demoMode}; bridge is not required (mock demo skips Pulsar→Redpanda).`);
    return;
  }

  const accessId = process.env.TUYA_PULSAR_ACCESS_ID ?? process.env.TUYA_ACCESS_ID;
  const accessKey = process.env.TUYA_PULSAR_ACCESS_KEY ?? process.env.TUYA_ACCESS_SECRET;
  if (!accessId || !accessKey) {
    throw new Error('TUYA_PULSAR_ACCESS_ID and TUYA_PULSAR_ACCESS_KEY are required in live mode');
  }

  const allowedProducts = parseAllowedProducts();
  const kafka = new DeviceEventKafkaProducer({
    brokers: parseBrokers(),
    topic: process.env.KAFKA_TOPIC_DEVICE_EVENTS ?? 'tuya.device.events',
  });
  await kafka.connect();

  const topic =
    process.env.TUYA_PULSAR_TOPIC ??
    `persistent://${accessId}/out/event`;

  const pulsar = new TuyaPulsarConsumer({
    serviceUrl: process.env.TUYA_PULSAR_URL ?? 'pulsar+ssl://mqe.tuyacn.com:7285/',
    accessId,
    accessKey,
    topic,
  });

  const forward = async (message: DeviceBusMessage): Promise<void> => {
    if (!isAllowedProduct(message.productId, allowedProducts)) {
      return;
    }
    await kafka.send(message);
  };

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down bridge...`);
    await pulsar.stop();
    await kafka.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  console.log(`Bridge started: Tuya Pulsar → Redpanda (live), topic=${topic}`);
  await pulsar.start(forward);
}

main().catch((err) => {
  console.error('Bridge failed to start', err);
  process.exit(1);
});
