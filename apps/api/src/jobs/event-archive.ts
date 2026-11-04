/** Monthly RANGE partitions on DeviceEventArchive. pmax holds anything newer. */

export type ArchivePartition = { name: string; description: string };

export function partitionName(year: number, month: number): string {
  return `p${year}${String(month).padStart(2, '0')}`;
}

/** First instant of the month after `year-month`, as YYYY-MM-DD. That is the RANGE upper bound. */
export function partitionUpperBound(year: number, month: number): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

/** Months that must exist so inserts around `now` land outside a future gap. */
export function monthsToEnsure(now: Date, ahead = 3): Array<{ name: string; lessThan: string }> {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const months: Array<{ name: string; lessThan: string }> = [];
  for (let i = 0; i <= ahead + 1; i += 1) {
    const cursor = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    months.push({ name: partitionName(year, month), lessThan: partitionUpperBound(year, month) });
  }
  return months;
}

/**
 * Drop a partition only when its entire range is older than the retention cutoff.
 * PARTITION_DESCRIPTION is MySQL TO_DAYS(upper bound). pmax is never dropped.
 */
export function partitionNamesToDrop(partitions: ArchivePartition[], cutoffDays: number): string[] {
  if (!Number.isFinite(cutoffDays)) return [];
  return partitions
    .filter((partition) => {
      if (!partition.name || partition.name === 'pmax') return false;
      const upper = Number(partition.description);
      return Number.isFinite(upper) && upper <= cutoffDays;
    })
    .map((partition) => partition.name);
}

const PARTITION_NAME = /^p\d{6}$/;

export function assertPartitionName(name: string): void {
  if (!PARTITION_NAME.test(name)) {
    throw new Error(`拒绝的分区名：${name}`);
  }
}
