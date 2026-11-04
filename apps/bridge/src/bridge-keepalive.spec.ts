import { BridgeKeepalive, ScheduleFn } from './bridge-keepalive';

function fakeClock(): { schedule: ScheduleFn; advance: (ms: number) => void } {
  let now = 0;
  let seq = 0;
  const items: Array<{ id: number; at: number; fn: () => void; cancelled: boolean }> = [];
  return {
    schedule(fn, ms) {
      const item = { id: ++seq, at: now + ms, fn, cancelled: false };
      items.push(item);
      return { cancel: () => { item.cancelled = true; } };
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

describe('BridgeKeepalive', () => {
  it('kills the socket when a ping is not answered', () => {
    const clock = fakeClock();
    const logs: string[] = [];
    const deaths: string[] = [];
    let pings = 0;
    const keepalive = new BridgeKeepalive(
      { pingIntervalMs: 100, pongTimeoutMs: 40, staleAfterMs: 10_000 },
      {
        sendPing: () => {
          pings += 1;
          return true;
        },
        onDead: (reason) => deaths.push(reason),
        log: (message) => logs.push(message),
        schedule: clock.schedule,
      },
    );
    keepalive.start();
    clock.advance(100);
    expect(pings).toBe(1);
    expect(deaths).toEqual([]);
    clock.advance(40);
    expect(deaths).toEqual(['pong_timeout']);
    expect(logs.join('\n')).toContain('pong 超时');
  });

  it('keeps the socket when any inbound frame arrives before the pong deadline', () => {
    const clock = fakeClock();
    const deaths: string[] = [];
    const keepalive = new BridgeKeepalive(
      { pingIntervalMs: 100, pongTimeoutMs: 40, staleAfterMs: 10_000 },
      {
        sendPing: () => true,
        onDead: (reason) => deaths.push(reason),
        log: () => undefined,
        schedule: clock.schedule,
      },
    );
    keepalive.start();
    clock.advance(100);
    keepalive.markRx();
    clock.advance(40);
    expect(deaths).toEqual([]);
  });

  it('kills a silent socket from the stale watchdog', () => {
    const clock = fakeClock();
    const logs: string[] = [];
    const deaths: string[] = [];
    const keepalive = new BridgeKeepalive(
      { pingIntervalMs: 10_000, pongTimeoutMs: 1_000, staleAfterMs: 500 },
      {
        sendPing: () => true,
        onDead: (reason) => deaths.push(reason),
        log: (message) => logs.push(message),
        schedule: clock.schedule,
      },
    );
    keepalive.start();
    clock.advance(500);
    expect(deaths).toEqual(['stale']);
    expect(logs.join('\n')).toContain('stale watchdog');
  });
});
