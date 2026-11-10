const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Instant rates are per hour. Gaps longer than two hours stay empty. */
export const USAGE_INSTANT_MAX_GAP_MS = 2 * 60 * 60 * 1000;

export const USAGE_RESET_NOTE =
  '表计出现回落，已按清零处理：当日只计入回落后的读数，不出现负用量。';
export const USAGE_GAP_NOTE = '缺测时段没有按平均用量补齐。';
export const USAGE_OPENING_NOTE = '窗口前没有这条读数，首笔无法差分，没有把它记成 0。';
export const USAGE_LOOKBACK_NOTE =
  '窗口前回查达到上限，更早的锚点未确认，没有把未知增量记成 0。';
export const USAGE_BOUNDARY_DIP_NOTE = '窗前读数高于窗口内读数，回落没有按历史总量计入。';

export type UsageAnchor = 'found' | 'absent' | 'limited';

/** This baseline stores property history only on DeviceEvent. 30 pages is 6000 rows. */
export const USAGE_LOOKBACK_PAGE_SIZE = 200;
export const USAGE_LOOKBACK_MAX_PAGES = 30;

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
  /**
   * Last reading of this meter at or before the window. It is not usage.
   * Cycle counters emit a period total and then fall to 0; when that total is
   * the first in-window sample, the diff needs this earlier reading. If nothing
   * was stored before the window, the opening sample stays the anchor.
   */
  baseline?: UsageSample | null;
  /** `limited` means the backward scan stopped before proving there was no earlier reading. */
  anchor?: UsageAnchor;
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
  anchor: UsageAnchor;
} {
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const bucket = input.bucket ?? 'day';
  const samples = input.samples
    .filter((sample) => sample.t >= fromMs && sample.t <= toMs && Number.isFinite(sample.value))
    .sort((a, b) => a.t - b.t);
  const baseline = input.mode === 'cumulative' ? precedingBaseline(samples, input.baseline) : null;
  const anchor: UsageAnchor = baseline ? 'found' : (input.anchor ?? 'absent');

  const days: UsageDay[] = [];
  let reset = false;
  let skippedGap = false;
  let openingUnresolved = false;
  let boundaryDip = false;
  let rawTotal = 0;
  if (input.mode === 'cumulative') {
    const folded = foldCumulative(baseline ? [baseline, ...samples] : samples, bucket, baseline != null);
    reset = folded.reset;
    openingUnresolved = folded.openingUnresolved;
    boundaryDip = folded.boundaryDip;
    for (const [start, value] of folded.buckets) {
      const safe = Math.max(0, value);
      rawTotal += safe;
      const rounded = roundMetric(safe);
      if (rounded === 0) continue;
      days.push({ date: formatShanghaiStamp(start, bucket), value: rounded });
    }
  } else {
    const size = bucket === 'hour' ? HOUR_MS : DAY_MS;
    let cursor = bucket === 'hour' ? shanghaiHourStart(fromMs) : shanghaiDayStart(fromMs);
    const last = bucket === 'hour' ? shanghaiHourStart(toMs) : shanghaiDayStart(toMs);
    while (cursor <= last) {
      const bucketEnd = cursor + size;
      const inBucket = samples.filter((sample) => sample.t >= cursor && sample.t < bucketEnd);
      const computed = integrateInstant(inBucket);
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

  const total = roundMetric(
    input.mode === 'cumulative' ? rawTotal : days.reduce((sum, day) => sum + day.value, 0),
  );
  const dailyAvg = days.length > 0 ? roundMetric(total / days.length) : null;
  const peakDay = days.reduce<UsagePeak | null>((best, day) => {
    if (!best || day.value > best.value) return { date: day.date, value: day.value };
    return best;
  }, null);
  const notes = [
    reset ? USAGE_RESET_NOTE : '',
    skippedGap ? USAGE_GAP_NOTE : '',
    anchor === 'limited' ? USAGE_LOOKBACK_NOTE : '',
    anchor !== 'limited' && openingUnresolved ? USAGE_OPENING_NOTE : '',
    boundaryDip ? USAGE_BOUNDARY_DIP_NOTE : '',
  ].filter(Boolean);
  return {
    bucket,
    days,
    total,
    dailyAvg,
    peakDay,
    note: notes.length > 0 ? notes.join('') : null,
    anchor,
  };
}

/** A stored reading before the window. An empty series does not invent usage from it. */
function precedingBaseline(
  samples: UsageSample[],
  baseline: UsageSample | null | undefined,
): UsageSample | null {
  if (!baseline || !Number.isFinite(baseline.t) || !Number.isFinite(baseline.value)) return null;
  if (samples.length === 0 || !(baseline.t < samples[0].t)) return null;
  return baseline;
}

function applyUsageStep(previous: number, next: number): { add: number; reset: boolean } {
  const delta = next - previous;
  if (delta >= 0) return { add: delta, reset: false };
  return { add: Math.max(0, next), reset: true };
}

/**
 * One diff for hour and day buckets. Each step belongs to the later reading's bucket,
 * including a step that crosses midnight. A flat or zero-valued step off the opening
 * sample is not recorded as measured zero.
 */
function foldCumulative(samples: UsageSample[], bucket: UsageBucket, anchored: boolean): {
  buckets: Array<[number, number]>;
  reset: boolean;
  openingUnresolved: boolean;
  boundaryDip: boolean;
} {
  const totals = new Map<number, number>();
  let reset = false;
  let openingUnresolved = !anchored && samples.length === 1;
  let boundaryDip = false;
  const bucketStart = bucket === 'hour' ? shanghaiHourStart : shanghaiDayStart;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1].value;
    const next = samples[index].value;
    if (index === 1 && anchored && next < previous && next > 0) {
      boundaryDip = true;
      continue;
    }
    const step = applyUsageStep(previous, next);
    if (index === 1 && step.add === 0) {
      if (!anchored) openingUnresolved = true;
      continue;
    }
    if (step.reset) reset = true;
    const key = bucketStart(samples[index].t);
    totals.set(key, (totals.get(key) ?? 0) + step.add);
  }
  return {
    buckets: [...totals.entries()].sort((a, b) => a[0] - b[0]),
    reset,
    openingUnresolved,
    boundaryDip,
  };
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
