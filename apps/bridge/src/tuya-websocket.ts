import WebSocket from 'ws';
import { buildTuyaPulsarPassword, decryptTuyaPayload } from './decrypt';
import { DeviceBusMessage } from './device-bus-message';
import { normalizeTuyaMessage } from './normalize';

export type WebsocketBridgeConfig = {
  accessId: string;
  accessKey: string;
  /** prod → out/event；test → out/event-test */
  env: 'prod' | 'test';
  /** China default; override with TUYA_MQ_WS_URL */
  wsBaseUrl?: string;
};

export type BridgeMessageHandler = (message: DeviceBusMessage) => Promise<void>;

const REGION_WS: Record<string, string> = {
  cn: 'wss://mqe.tuyacn.com:8285/',
  us: 'wss://mqe.tuyaus.com:8285/',
  eu: 'wss://mqe.tuyaeu.com:8285/',
  in: 'wss://mqe.tuyain.com:8285/',
};

function topicEnvSegment(env: 'prod' | 'test'): string {
  return env === 'test' ? 'event-test' : 'event';
}

function buildConsumerUrl(accessId: string, env: 'prod' | 'test', wsBaseUrl: string): string {
  const base = wsBaseUrl.endsWith('/') ? wsBaseUrl : `${wsBaseUrl}/`;
  const topicEnv = topicEnvSegment(env);
  const query = new URLSearchParams({
    subscriptionType: 'Failover',
    ackTimeoutMillis: '30000',
  }).toString();
  return `${base}ws/v2/consumer/persistent/${accessId}/out/${topicEnv}/${accessId}-sub?${query}`;
}

type WsEnvelope = {
  messageId?: string;
  payload?: string;
  properties?: Record<string, string>;
  publishTime?: string;
  redeliveryCount?: number;
};

/**
 * Tuya message-queue over WebSocket (official Node path).
 * Stock `pulsar-client` cannot do Tuya auth1; this is the supported consumer.
 */
export class TuyaWebsocketConsumer {
  private ws: WebSocket | null = null;
  private stopped = false;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimes = 0;
  private readonly maxRetryTimes: number;
  private readonly retryTimeoutMs: number;
  private readonly idleTimeoutMs: number;
  private onMessage: BridgeMessageHandler | null = null;

  constructor(
    private readonly config: WebsocketBridgeConfig,
    opts?: { maxRetryTimes?: number; retryTimeoutMs?: number; idleTimeoutMs?: number },
  ) {
    this.maxRetryTimes = opts?.maxRetryTimes ?? 100;
    this.retryTimeoutMs = opts?.retryTimeoutMs ?? 1000;
    this.idleTimeoutMs = opts?.idleTimeoutMs ?? 30_000;
  }

  async start(onMessage: BridgeMessageHandler): Promise<void> {
    this.onMessage = onMessage;
    this.stopped = false;
    this.connect(true);
    // Keep process alive; reconnect loop is event-driven.
    await new Promise<never>(() => undefined);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearKeepAlive();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(isInit: boolean): void {
    if (this.stopped) return;

    const wsBaseUrl =
      this.config.wsBaseUrl ??
      REGION_WS[(process.env.TUYA_MQ_REGION ?? 'cn').toLowerCase()] ??
      REGION_WS.cn;
    const url = buildConsumerUrl(this.config.accessId, this.config.env, wsBaseUrl);
    const password = buildTuyaPulsarPassword(this.config.accessId, this.config.accessKey);

    console.log(
      `Connecting Tuya MQ WebSocket env=${this.config.env} url=${url.replace(this.config.accessId, '***')}`,
    );

    const ws = new WebSocket(url, {
      headers: {
        username: this.config.accessId,
        password,
      },
    });
    this.ws = ws;

    ws.on('open', () => {
      this.retryTimes = 0;
      this.armKeepAlive(ws);
      console.log(isInit ? 'Tuya MQ WebSocket open' : 'Tuya MQ WebSocket reconnected');
    });

    ws.on('ping', () => {
      this.armKeepAlive(ws);
      ws.pong(this.config.accessId);
    });

    ws.on('pong', () => {
      this.armKeepAlive(ws);
    });

    ws.on('message', (data) => {
      void this.handleRawMessage(ws, data);
    });

    ws.on('error', (err) => {
      console.error('Tuya MQ WebSocket error', err);
    });

    ws.on('close', (code, reason) => {
      this.clearKeepAlive();
      console.warn(`Tuya MQ WebSocket closed code=${code} reason=${reason.toString()}`);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.retryTimes >= this.maxRetryTimes) {
      console.error(`Tuya MQ WebSocket exceeded maxRetryTimes=${this.maxRetryTimes}`);
      return;
    }
    this.retryTimes += 1;
    const delay = this.retryTimeoutMs * Math.min(this.retryTimes, 10);
    console.log(`Reconnecting Tuya MQ in ${delay}ms (attempt ${this.retryTimes})`);
    setTimeout(() => this.connect(false), delay);
  }

  private armKeepAlive(ws: WebSocket): void {
    this.clearKeepAlive();
    this.keepAliveTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping(this.config.accessId);
      }
    }, this.idleTimeoutMs);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private async handleRawMessage(ws: WebSocket, data: WebSocket.RawData): Promise<void> {
    this.armKeepAlive(ws);
    let envelope: WsEnvelope;
    try {
      envelope = JSON.parse(data.toString()) as WsEnvelope;
    } catch (err) {
      console.error('Invalid WebSocket frame (not JSON)', err);
      return;
    }

    const messageId = envelope.messageId;
    try {
      const normalized = this.decodeEnvelope(envelope);
      if (normalized && this.onMessage) {
        await this.onMessage(normalized);
      }
      if (messageId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ messageId }));
      }
    } catch (err) {
      console.error('Failed to process Tuya MQ message; not acking', err);
    }
  }

  private decodeEnvelope(envelope: WsEnvelope): DeviceBusMessage | null {
    if (!envelope.payload) {
      return null;
    }

    const payloadJson = Buffer.from(envelope.payload, 'base64').toString('utf8');
    const inner = JSON.parse(payloadJson) as {
      data?: string;
      sign?: string;
      bizCode?: string;
      ts?: number;
      t?: number;
      protocol?: number;
      pv?: string;
    };

    const decryptMode =
      envelope.properties?.em ??
      process.env.TUYA_MQ_ENCRYPT ??
      'aes_gcm';

    const decrypted = decryptTuyaPayload(
      inner,
      this.config.accessKey,
      decryptMode === 'aes_gcm' || decryptMode === 'aes-gcm' ? 'aes_gcm' : decryptMode,
    );

    // Decrypted body may be the biz payload itself, or nested under data.
    const bizCode = String(inner.bizCode ?? decrypted.bizCode ?? '');
    const ts = Number(inner.ts ?? inner.t ?? decrypted.ts ?? decrypted.t ?? Date.now());
    return normalizeTuyaMessage({ ...decrypted, bizCode, ts });
  }
}

export function parseMqEnv(raw = process.env.TUYA_MQ_ENV ?? 'prod'): 'prod' | 'test' {
  const v = raw.trim().toLowerCase();
  return v === 'test' ? 'test' : 'prod';
}
