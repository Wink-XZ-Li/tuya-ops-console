export type TimerHandle = { cancel: () => void };

export type ScheduleFn = (fn: () => void, ms: number) => TimerHandle;

export function defaultSchedule(fn: () => void, ms: number): TimerHandle {
  const timer = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(timer) };
}

export type KeepaliveTimers = {
  pingIntervalMs: number;
  pongTimeoutMs: number;
  staleAfterMs: number;
};

export function readKeepaliveConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<KeepaliveTimers> = {},
): KeepaliveTimers {
  return {
    pingIntervalMs: firstPositive(overrides.pingIntervalMs, env.TUYA_MQ_PING_INTERVAL_MS, 30_000),
    pongTimeoutMs: firstPositive(overrides.pongTimeoutMs, env.TUYA_MQ_PONG_TIMEOUT_MS, 10_000),
    staleAfterMs: firstPositive(overrides.staleAfterMs, env.TUYA_MQ_STALE_MS, 90_000),
  };
}

/**
 * One keepalive path for the Tuya MQ socket:
 * - ping on a fixed cadence
 * - if that ping is not answered by any inbound frame before pongTimeout, die
 * - if nothing is received for staleAfter, die (covers a socket that never wakes ping)
 * Inbound message, server ping, or pong all count as RX and clear the pong deadline.
 */
export class BridgeKeepalive {
  private pingTimer: TimerHandle | null = null;
  private pongTimer: TimerHandle | null = null;
  private staleTimer: TimerHandle | null = null;
  private awaitingPong = false;
  private stopped = false;

  constructor(
    private readonly timers: KeepaliveTimers,
    private readonly actions: {
      /** Return false when the socket is not open and no ping was sent. */
      sendPing: () => boolean;
      onDead: (reason: 'pong_timeout' | 'stale') => void;
      log: (message: string) => void;
      schedule?: ScheduleFn;
    },
  ) {}

  start(): void {
    this.stopped = false;
    this.armPing();
    this.armStale();
  }

  stop(): void {
    this.stopped = true;
    this.awaitingPong = false;
    this.clearPong();
    this.pingTimer?.cancel();
    this.pingTimer = null;
    this.staleTimer?.cancel();
    this.staleTimer = null;
  }

  /** Any inbound frame: message, server ping, or pong. */
  markRx(): void {
    if (this.stopped) return;
    this.awaitingPong = false;
    this.clearPong();
    this.armStale();
  }

  private schedule(fn: () => void, ms: number): TimerHandle {
    return (this.actions.schedule ?? defaultSchedule)(fn, ms);
  }

  private armPing(): void {
    this.pingTimer?.cancel();
    this.pingTimer = this.schedule(() => {
      if (this.stopped) return;
      let sent = false;
      try {
        sent = this.actions.sendPing();
      } catch (err) {
        this.actions.log(
          `涂鸦 MQ ping 发送失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (sent) {
        this.awaitingPong = true;
        this.armPongDeadline();
      }
      this.armPing();
    }, this.timers.pingIntervalMs);
  }

  private armPongDeadline(): void {
    this.clearPong();
    this.pongTimer = this.schedule(() => {
      if (this.stopped || !this.awaitingPong) return;
      this.awaitingPong = false;
      this.actions.log('涂鸦 MQ pong 超时，关闭连接并重连');
      this.actions.onDead('pong_timeout');
    }, this.timers.pongTimeoutMs);
  }

  private armStale(): void {
    this.staleTimer?.cancel();
    this.staleTimer = this.schedule(() => {
      if (this.stopped) return;
      this.actions.log('涂鸦 MQ 连接无收包，stale watchdog 关闭并重连');
      this.actions.onDead('stale');
    }, this.timers.staleAfterMs);
  }

  private clearPong(): void {
    this.pongTimer?.cancel();
    this.pongTimer = null;
  }
}

function firstPositive(
  override: number | undefined,
  raw: string | undefined,
  fallback: number,
): number {
  if (override != null && Number.isFinite(override) && override > 0) return Math.floor(override);
  if (raw != null && raw.trim() !== '') {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return fallback;
}
