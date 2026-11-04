import { EventEmitter } from 'events';
import { ScheduleFn } from './bridge-keepalive';
import { TuyaWebsocketConsumer } from './tuya-websocket';

class FakeSocket extends EventEmitter {
  readyState = 1;
  pings: unknown[] = [];
  terminated = false;
  send(): void {}
  ping(data?: unknown): void {
    this.pings.push(data);
  }
  pong(): void {}
  close(): void {
    this.readyState = 3;
    this.emit('close', 1000, Buffer.from('close'));
  }
  terminate(): void {
    this.terminated = true;
    this.readyState = 3;
    this.emit('close', 1006, Buffer.from('terminate'));
  }
}

function fakeClock(): { schedule: ScheduleFn; advance: (ms: number) => void } {
  let now = 0;
  let seq = 0;
  const items: Array<{ id: number; at: number; fn: () => void; cancelled: boolean }> = [];
  return {
    schedule(fn, ms) {
      const item = { id: ++seq, at: now + ms, fn, cancelled: false };
      items.push(item);
      return {
        cancel: () => {
          item.cancelled = true;
        },
      };
    },
    advance(ms) {
      now += ms;
      for (;;) {
        const next = items
          .filter((item) => !item.cancelled && item.at <= now)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!next) return;
        next.cancelled = true;
        next.fn();
      }
    },
  };
}

describe('TuyaWebsocketConsumer keepalive', () => {
  const logs: string[] = [];

  beforeEach(() => {
    logs.length = 0;
    jest.spyOn(console, 'warn').mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });
    jest.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a pong timeout and reconnects', async () => {
    const clock = fakeClock();
    const sockets: FakeSocket[] = [];
    const consumer = new TuyaWebsocketConsumer(
      {
        accessId: 'access-id',
        accessKey: 'access-key',
        env: 'prod',
        wsBaseUrl: 'wss://example.test/',
      },
      {
        pingIntervalMs: 100,
        pongTimeoutMs: 40,
        staleAfterMs: 10_000,
        retryTimeoutMs: 25,
        schedule: clock.schedule,
        createSocket: () => {
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket;
        },
      },
    );

    void consumer.start(async () => undefined);
    expect(sockets).toHaveLength(1);
    sockets[0].emit('open');
    clock.advance(100);
    expect(sockets[0].pings).toEqual(['access-id']);
    clock.advance(40);
    expect(logs.join('\n')).toContain('pong 超时');
    expect(sockets[0].terminated).toBe(true);
    clock.advance(25);
    expect(sockets).toHaveLength(2);
    expect(logs.join('\n')).toContain('Reconnecting Tuya MQ');

    await consumer.stop();
  });
});
