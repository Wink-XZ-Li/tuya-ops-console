export const FLEET_PRODUCT_ID = '';

/**
 * SQL mirror of rollupFaultCode. Connectivity, offline, blank, and `unknown`
 * stay out of DailyFaultStat. `faultCode = 'offline'` is the exact column
 * compare used before trim, matching the JS helper.
 */
export const FAULT_ROLLUP_WHERE_SQL = `(a.category IS NULL OR a.category <> 'connectivity')
  AND a.faultCode IS NOT NULL
  AND a.faultCode <> 'offline'
  AND TRIM(a.faultCode) <> ''
  AND TRIM(a.faultCode) <> 'unknown'`;

/** Fault-stat key. Connectivity, offline, blank, and `unknown` are omitted. */
export function rollupFaultCode(row: {
  faultCode?: string | null;
  category?: string | null;
}): string | null {
  if (row.category === 'connectivity' || row.faultCode === 'offline') return null;
  const code = row.faultCode?.trim();
  if (!code || code === 'unknown') return null;
  return code;
}

/** JS form of FAULT_ROLLUP_WHERE_SQL, kept in lockstep with rollupFaultCode. */
export function sqlPredicateKeeps(row: {
  faultCode?: string | null;
  category?: string | null;
}): boolean {
  if (row.category === 'connectivity') return false;
  if (row.faultCode == null || row.faultCode === 'offline') return false;
  const trimmed = row.faultCode.trim();
  if (!trimmed || trimmed === 'unknown') return false;
  return true;
}

export function faultDurationMinutes(row: {
  openedAt: Date;
  closedAt: Date;
  conditionStartedAt?: Date | null;
}): number {
  const start = row.conditionStartedAt ?? row.openedAt;
  return Math.max(0, Math.round((row.closedAt.getTime() - start.getTime()) / 60000));
}

export type FaultAgg = {
  productId: string;
  faultCode: string;
  newCount: number;
  closedCount: number;
  openCount: number;
  mttrSum: number;
  mttrN: number;
};

export function mergeFaultGroups(input: {
  opened: Array<{ productId: string; faultCode: string; newCount: number }>;
  closed: Array<{ productId: string; faultCode: string; closedCount: number; mttrSum: number }>;
  stillOpen: Array<{ productId: string; faultCode: string; openCount: number }>;
}): FaultAgg[] {
  const buckets = new Map<string, FaultAgg>();

  const ensure = (productId: string, faultCode: string): FaultAgg => {
    const key = `${productId}\0${faultCode}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        productId,
        faultCode,
        newCount: 0,
        closedCount: 0,
        openCount: 0,
        mttrSum: 0,
        mttrN: 0,
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  const add = (productId: string, faultCode: string, apply: (bucket: FaultAgg) => void) => {
    const code = rollupFaultCode({ faultCode, category: 'fault' });
    if (!code) return;
    apply(ensure(productId, code));
    if (productId !== FLEET_PRODUCT_ID) apply(ensure(FLEET_PRODUCT_ID, code));
  };

  for (const row of input.opened) {
    add(row.productId, row.faultCode, (bucket) => {
      bucket.newCount += asCount(row.newCount);
    });
  }
  for (const row of input.closed) {
    add(row.productId, row.faultCode, (bucket) => {
      const closed = asCount(row.closedCount);
      bucket.closedCount += closed;
      bucket.mttrSum += asCount(row.mttrSum);
      bucket.mttrN += closed;
    });
  }
  for (const row of input.stillOpen) {
    add(row.productId, row.faultCode, (bucket) => {
      bucket.openCount += asCount(row.openCount);
    });
  }

  return [...buckets.values()].filter(
    (bucket) => bucket.newCount > 0 || bucket.openCount > 0 || bucket.closedCount > 0,
  );
}

export function mttrMinutesAvg(bucket: Pick<FaultAgg, 'mttrSum' | 'mttrN'>): number | null {
  if (bucket.mttrN <= 0) return null;
  return Math.round(bucket.mttrSum / bucket.mttrN);
}

export function asCount(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function weightedMttrMinutes(
  rows: Array<{ closedCount: number; mttrMinutesAvg: number | null }>,
): number | null {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.mttrMinutesAvg == null || row.closedCount <= 0) continue;
    sum += row.mttrMinutesAvg * row.closedCount;
    weight += row.closedCount;
  }
  if (weight <= 0) return null;
  return Math.round(sum / weight);
}
