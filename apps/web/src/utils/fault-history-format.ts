/** Timeline phrasing: 「3 天前开」/「已关 · 持续 2h」. */
export function formatTimelineDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}分钟`;
  if (rounded < 24 * 60) return `${Math.round(rounded / 60)}h`;
  return `${Math.round(rounded / (24 * 60))}天`;
}

export function formatTimelineWhen(
  item: {
    status: string;
    openedAt: string;
    conditionStartedAt?: string | null;
    durationMinutes: number;
  },
  now: Date,
): string {
  if (item.status === 'closed') {
    return `已关 · 持续 ${formatTimelineDuration(item.durationMinutes)}`;
  }
  const start = new Date(item.conditionStartedAt || item.openedAt);
  const minutes = Math.max(0, Math.round((now.getTime() - start.getTime()) / 60_000));
  if (minutes < 1) return '刚刚开';
  if (minutes < 60) return `${minutes} 分钟前开`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} 小时前开`;
  return `${Math.round(minutes / (24 * 60))} 天前开`;
}

export function faultHistoryBounds(
  range: '7d' | '30d' | 'all',
  now: Date,
): { from?: string; to?: string } {
  if (range === 'all') return {};
  const days = range === '7d' ? 7 : 30;
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60_000).toISOString(),
    to: now.toISOString(),
  };
}
