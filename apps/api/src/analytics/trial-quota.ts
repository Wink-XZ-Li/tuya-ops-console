/** IoT Core 试用基础资源包当月额度用完。服务过期是 28841002，不要当成额度耗尽。 */
export const TUYA_TRIAL_QUOTA_EXHAUSTED_CODE = 28841004;

/** 额度耗尽后，这段时间内不再打涂鸦分析接口，避免刷新把试用额度反复打满。 */
export const TRIAL_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;

export type AnalyticsDataSource = 'virtual' | 'live';

export type AnalyticsVirtualReason = 'requested' | 'quota-fallback';

export type AnalyticsDataMeta = {
  dataMode: 'live' | 'virtual';
  virtual: boolean;
  quotaExhausted: boolean;
  virtualReason: AnalyticsVirtualReason | null;
};

export class TrialQuotaGate {
  private exhaustedUntil = 0;
  private clearUntil = 0;

  constructor(private readonly cooldownMs = TRIAL_QUOTA_COOLDOWN_MS) {}

  markExhausted(now = Date.now()): void {
    this.exhaustedUntil = now + this.cooldownMs;
    this.clearUntil = 0;
  }

  markClear(now = Date.now()): void {
    this.exhaustedUntil = 0;
    this.clearUntil = now + this.cooldownMs;
  }

  isExhausted(now = Date.now()): boolean {
    return now < this.exhaustedUntil;
  }

  /** 最近一次星象仪调用成功，设备分析页不必再额外探测。 */
  isClearFresh(now = Date.now()): boolean {
    return now < this.clearUntil && !this.isExhausted(now);
  }

  reset(): void {
    this.exhaustedUntil = 0;
    this.clearUntil = 0;
  }
}

export function isTrialQuotaExhausted(input: unknown): boolean {
  if (readCode(input) === TUYA_TRIAL_QUOTA_EXHAUSTED_CODE) return true;
  const text = readText(input);
  if (/trial quota is exhausted/i.test(text)) return true;
  return new RegExp(
    `(?:^|[^0-9])${TUYA_TRIAL_QUOTA_EXHAUSTED_CODE}(?:[^0-9]|$)`,
  ).test(text);
}

function readCode(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (!input || typeof input !== 'object') return null;
  const code = (input as { code?: unknown }).code;
  if (typeof code === 'number' && Number.isFinite(code)) return code;
  if (typeof code === 'string' && /^\d+$/.test(code)) return Number(code);
  return null;
}

function readText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.message;
  if (input && typeof input === 'object') {
    const row = input as { msg?: unknown; message?: unknown };
    const msg = row.msg ?? row.message;
    if (typeof msg === 'string') return msg;
    try {
      return JSON.stringify(input);
    } catch {
      return String(input);
    }
  }
  return String(input ?? '');
}
