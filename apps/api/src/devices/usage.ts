const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Instant rates are per hour. Gaps longer than two hours stay empty. */
export const USAGE_INSTANT_MAX_GAP_MS = 2 * 60 * 60 * 1000;

export const USAGE_RESET_NOTE =
  '表计出现回落，已按清零处理：当日只计入回落后的读数，不出现负用量。';
export const USAGE_GAP_NOTE = '缺测时段没有按平均用量补齐。';

export type UsageMode = 'cumulative' | 'instant';
export type UsageDay = { date: string; value: number };
export type UsagePeak = { date: string; value: number };

export type UsageSample = { t: number; value: number };

export function shanghaiDayStart(timeMs: number): number {
  const shifted = timeMs + SHANGHAI_OFFSET_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - SHANGHAI_OFFSET_MS;
}

export function formatShanghaiDate(dayStartMs: number): string {
  const shifted = new Date(dayStartMs + SHANGHAI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildUsage(input: {
  samples: UsageSample[];
  from: Date;
  to: Date;
  mode: UsageMode;
}): {
  days: UsageDay[];
  total: number;
  dailyAvg: number | null;
  peakDay: UsagePeak | null;
  note: string | null;
} {
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const samples = input.samples
    .filter((sample) => sample.t >= fromMs && sample.t <= toMs && Number.isFinite(sample.value))
    .sort((a, b) => a.t - b.t);

  const days: UsageDay[] = [];
  let reset = false;
  let skippedGap = false;
  let cursor = shanghaiDayStart(fromMs);
  const lastDay = shanghaiDayStart(toMs);
  while (cursor <= lastDay) {
    const dayEnd = cursor + DAY_MS;
    const inDay = samples.filter((sample) => sample.t >= cursor && sample.t < dayEnd);
    const computed = input.mode === 'instant' ? integrateInstant(inDay) : diffCumulative(inDay);
    if (computed) {
      days.push({ date: formatShanghaiDate(cursor), value: roundMetric(Math.max(0, computed.value)) });
      reset = reset || computed.reset;
      skippedGap = skippedGap || computed.skippedGap;
    }
    cursor += DAY_MS;
  }

  const total = roundMetric(days.reduce((sum, day) => sum + day.value, 0));
  const dailyAvg = days.length > 0 ? roundMetric(total / days.length) : null;
  const peakDay = days.reduce<UsagePeak | null>((best, day) => {
    if (!best || day.value > best.value) return { date: day.date, value: day.value };
    return best;
  }, null);
  const notes = [reset ? USAGE_RESET_NOTE : '', skippedGap ? USAGE_GAP_NOTE : ''].filter(Boolean);
  return { days, total, dailyAvg, peakDay, note: notes.length > 0 ? notes.join('') : null };
}

function diffCumulative(
  samples: UsageSample[],
): { value: number; reset: boolean; skippedGap: boolean } | null {
  if (samples.length < 2) return null;
  let value = 0;
  let reset = false;
  for (let index = 1; index < samples.length; index += 1) {
    const delta = samples[index].value - samples[index - 1].value;
    if (delta >= 0) {
      value += delta;
    } else {
      reset = true;
      value += Math.max(0, samples[index].value);
    }
  }
  return { value, reset, skippedGap: false };
}

function integrateInstant(
  samples: UsageSample[],
): { value: number; reset: boolean; skippedGap: boolean } | null {
  if (samples.length < 2) return null;
  let value = 0;
  let used = false;
  let skippedGap = false;
  for (let index = 1; index < samples.length; index += 1) {
    const span = samples[index].t - samples[index - 1].t;
    if (span <= 0) continue;
    if (span > USAGE_INSTANT_MAX_GAP_MS) {
      skippedGap = true;
      continue;
    }
    const avg = (samples[index].value + samples[index - 1].value) / 2;
    value += avg * (span / HOUR_MS);
    used = true;
  }
  if (!used) return null;
  return { value, reset: false, skippedGap };
}
