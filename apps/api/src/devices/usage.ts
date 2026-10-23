const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Instant rates are per hour. Gaps longer than two hours stay empty. */
export const USAGE_INSTANT_MAX_GAP_MS = 2 * 60 * 60 * 1000;

export const USAGE_RESET_NOTE =
  '表计出现回落，已按清零处理：当日只计入回落后的读数，不出现负用量。';
export const USAGE_GAP_NOTE = '缺测时段没有按平均用量补齐。';

export type UsageMode = 'cumulative' | 'instant';
/** `hour` for spans up to 48 hours; `day` for the 7-day and 30-day views. */
export type UsageBucket = 'hour' | 'day';
export type UsageDay = { date: string; value: number };
export type UsagePeak = { date: string; value: number };

export type UsageSample = { t: number; value: number };

export function shanghaiDayStart(timeMs: number): number {
  const shifted = timeMs + SHANGHAI_OFFSET_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - SHANGHAI_OFFSET_MS;
}

export function formatShanghaiDate(dayStartMs: number): string {
  return formatShanghaiStamp(dayStartMs, 'day');
}

export function shanghaiHourStart(timeMs: number): number {
  const shifted = timeMs + SHANGHAI_OFFSET_MS;
  return Math.floor(shifted / HOUR_MS) * HOUR_MS - SHANGHAI_OFFSET_MS;
}

/** Windows of 48 hours or less read better as hourly bars. Longer windows stay daily. */
export function usageBucketForRange(spanMs: number): UsageBucket {
  return spanMs <= 48 * HOUR_MS ? 'hour' : 'day';
}

export function formatShanghaiStamp(bucketStartMs: number, bucket: UsageBucket): string {
  const shifted = new Date(bucketStartMs + SHANGHAI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  if (bucket === 'day') return `${year}-${month}-${day}`;
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:00`;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildUsage(input: {
  samples: UsageSample[];
  from: Date;
  to: Date;
  mode: UsageMode;
  bucket?: UsageBucket;
}): {
  bucket: UsageBucket;
  days: UsageDay[];
  total: number;
  dailyAvg: number | null;
  peakDay: UsagePeak | null;
  note: string | null;
} {
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const bucket = input.bucket ?? 'day';
  const samples = input.samples
    .filter((sample) => sample.t >= fromMs && sample.t <= toMs && Number.isFinite(sample.value))
    .sort((a, b) => a.t - b.t);

  const days: UsageDay[] = [];
  let reset = false;
  let skippedGap = false;
  if (bucket === 'hour' && input.mode === 'cumulative') {
    const hourly = diffCumulativeByHour(samples);
    reset = hourly.reset;
    for (const [start, value] of hourly.hours) {
      days.push({ date: formatShanghaiStamp(start, 'hour'), value: roundMetric(Math.max(0, value)) });
    }
  } else {
    const size = bucket === 'hour' ? HOUR_MS : DAY_MS;
    let cursor = bucket === 'hour' ? shanghaiHourStart(fromMs) : shanghaiDayStart(fromMs);
    const last = bucket === 'hour' ? shanghaiHourStart(toMs) : shanghaiDayStart(toMs);
    while (cursor <= last) {
      const bucketEnd = cursor + size;
      const inBucket = samples.filter((sample) => sample.t >= cursor && sample.t < bucketEnd);
      const computed = input.mode === 'instant' ? integrateInstant(inBucket) : diffCumulative(inBucket);
      if (computed) {
        days.push({
          date: formatShanghaiStamp(cursor, bucket),
          value: roundMetric(Math.max(0, computed.value)),
        });
        reset = reset || computed.reset;
        skippedGap = skippedGap || computed.skippedGap;
      }
      cursor += size;
    }
  }

  const total = roundMetric(days.reduce((sum, day) => sum + day.value, 0));
  const dailyAvg = days.length > 0 ? roundMetric(total / days.length) : null;
  const peakDay = days.reduce<UsagePeak | null>((best, day) => {
    if (!best || day.value > best.value) return { date: day.date, value: day.value };
    return best;
  }, null);
  const notes = [reset ? USAGE_RESET_NOTE : '', skippedGap ? USAGE_GAP_NOTE : ''].filter(Boolean);
  return { bucket, days, total, dailyAvg, peakDay, note: notes.length > 0 ? notes.join('') : null };
}

/** Attribute each meter step to the Shanghai hour of the later reading. Hours with no step are omitted. */
function diffCumulativeByHour(samples: UsageSample[]): {
  hours: Array<[number, number]>;
  reset: boolean;
} {
  const totals = new Map<number, number>();
  let reset = false;
  for (let index = 1; index < samples.length; index += 1) {
    const delta = samples[index].value - samples[index - 1].value;
    let add = 0;
    if (delta >= 0) {
      add = delta;
    } else {
      reset = true;
      add = Math.max(0, samples[index].value);
    }
    const hour = shanghaiHourStart(samples[index].t);
    totals.set(hour, (totals.get(hour) ?? 0) + add);
  }
  return { hours: [...totals.entries()].sort((a, b) => a[0] - b[0]), reset };
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
