export type TopicEndOffset = {
  partition: number;
  high: string;
  low: string;
};

export type PartitionOffset = {
  partition: number;
  offset: string;
};

export function parseBroker(broker: string): { host: string; port: number } | null {
  const trimmed = broker.trim();
  const index = trimmed.lastIndexOf(':');
  if (index <= 0) return null;
  const host = trimmed.slice(0, index).trim();
  const port = Number(trimmed.slice(index + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

export function partitionLag(high: string, low: string, committed: string | undefined): number {
  const end = Number(high);
  const start = Number(low);
  if (!Number.isFinite(end)) return 0;
  const commit = committed == null ? Number.NaN : Number(committed);
  if (!Number.isFinite(commit) || commit < 0) {
    const base = Number.isFinite(start) ? start : 0;
    return Math.max(0, end - base);
  }
  return Math.max(0, end - commit);
}

export function consumerLag(ends: TopicEndOffset[], committed: PartitionOffset[]): number {
  const commits = new Map(committed.map((row) => [row.partition, row.offset]));
  return ends.reduce(
    (sum, end) => sum + partitionLag(end.high, end.low, commits.get(end.partition)),
    0,
  );
}

export function sumHighWatermark(ends: Array<{ high: string }>): number {
  return ends.reduce((sum, row) => sum + (Number(row.high) || 0), 0);
}

/** True when some partition still has a record at or after the cutoff. */
export function topicHasRecentMessages(
  ends: Array<{ partition: number; high: string }>,
  byTimestamp: PartitionOffset[],
): boolean {
  const offsets = new Map(byTimestamp.map((row) => [row.partition, Number(row.offset)]));
  return ends.some((end) => {
    const high = Number(end.high);
    const at = offsets.get(end.partition);
    return Number.isFinite(high) && high > 0 && at != null && Number.isFinite(at) && at < high;
  });
}
