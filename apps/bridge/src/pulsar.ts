import Pulsar from 'pulsar-client';
import { decryptTuyaPayload } from './decrypt';
import { DeviceBusMessage } from './device-bus-message';
import { normalizeTuyaMessage } from './normalize';
import { AuthenticationTuya } from './tuya-auth';

export type PulsarBridgeConfig = {
  serviceUrl: string;
  accessId: string;
  accessKey: string;
  topic?: string;
};

export type BridgeMessageHandler = (message: DeviceBusMessage) => Promise<void>;

function topicForAccessId(accessId: string): string {
  return `persistent://${accessId}/out/event`;
}

function subscriptionName(accessId: string): string {
  return `${accessId}-sub`;
}

export class TuyaPulsarConsumer {
  private client: InstanceType<typeof Pulsar.Client> | null = null;
  private consumer: Awaited<
    ReturnType<InstanceType<typeof Pulsar.Client>['subscribe']>
  > | null = null;

  constructor(private readonly config: PulsarBridgeConfig) {}

  async start(onMessage: BridgeMessageHandler): Promise<void> {
    const topic = this.config.topic ?? topicForAccessId(this.config.accessId);
    this.client = new Pulsar.Client({
      serviceUrl: this.config.serviceUrl,
      tlsTrustCertsFilePath: '',
      tlsAllowInsecureConnection: true,
      authentication: new AuthenticationTuya(this.config.accessId, this.config.accessKey),
    });

    this.consumer = await this.client.subscribe({
      topic,
      subscription: subscriptionName(this.config.accessId),
      subscriptionType: 'Failover',
      ackTimeoutMs: 30_000,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const msg = await this.consumer.receive();
      try {
        const normalized = this.decodeMessage(msg);
        if (normalized) {
          await onMessage(normalized);
        }
        await this.consumer.acknowledge(msg);
      } catch (err) {
        console.error('Failed to process Pulsar message; negative ack', err);
        await this.consumer.negativeAcknowledge(msg);
      }
    }
  }

  private decodeMessage(msg: { getData(): Buffer; getProperties(): Record<string, string> }): DeviceBusMessage | null {
    const rawText = msg.getData().toString('utf8');
    const envelope = JSON.parse(rawText) as Record<string, unknown>;
    const decryptMode = msg.getProperties()?.em;
    const decrypted = decryptTuyaPayload(
      envelope as { data?: string; sign?: string },
      this.config.accessKey,
      decryptMode,
    );

    const bizCode = String(envelope.bizCode ?? decrypted.bizCode ?? '');
    const ts = Number(envelope.ts ?? envelope.t ?? decrypted.ts ?? decrypted.t ?? Date.now());
    return normalizeTuyaMessage({ ...decrypted, bizCode, ts });
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.close();
      this.consumer = null;
    }
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
