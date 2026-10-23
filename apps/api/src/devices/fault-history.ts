import { alertDurationMinutes } from '../alerts/alerts.service';

export const FAULT_HISTORY_PAGE_SIZE = 20;

export type FaultHistoryFocus = 'open' | 'opened';

export type FaultHistoryRow = {
  id: string;
  status: string;
  category: string | null;
  faultCode: string | null;
  title: string;
  openedAt: Date;
  closedAt: Date | null;
  conditionStartedAt: Date | null;
  occurrenceCount: number;
  lastSeenAt: Date | null;
  closedReason: string | null;
  detail?: unknown;
};

export type FaultHistoryOptions = {
  from?: Date;
  to?: Date;
  includeConnectivity: boolean;
  focus?: FaultHistoryFocus;
};

export type FaultCopyRow = {
  code: string;
  label: string;
  symptom: string | null;
  suggestedAction: string | null;
};

export type FaultHistorySummary = {
  openCount: number;
  openedInRange: number;
  longestDurationMinutes: number | null;
};

const CLOSED_REASON_LABELS: Record<string, string> = {
  auto_clear: '自动恢复',
  manual: '人工关闭',
  online: '设备上线',
  migration_dedupe: '迁移去重',
};

export function alertStart(alert: Pick<FaultHistoryRow, 'openedAt' | 'conditionStartedAt'>): Date {
  return alert.conditionStartedAt ?? alert.openedAt;
}

export function isUnclosed(alert: Pick<FaultHistoryRow, 'status'>): boolean {
  return alert.status !== 'closed';
}

export function isConnectivityAlert(
  alert: Pick<FaultHistoryRow, 'category' | 'faultCode'>,
): boolean {
  return alert.category === 'connectivity' || alert.faultCode === 'offline';
}

export function isQualityFault(alert: Pick<FaultHistoryRow, 'category' | 'faultCode'>): boolean {
  return alert.category === 'fault' && alert.faultCode !== 'offline';
}

export function matchesFaultHistoryCategory(
  alert: Pick<FaultHistoryRow, 'category' | 'faultCode'>,
  includeConnectivity: boolean,
): boolean {
  if (isQualityFault(alert)) return true;
  return includeConnectivity && isConnectivityAlert(alert);
}

export function inWindow(
  alert: Pick<FaultHistoryRow, 'openedAt' | 'conditionStartedAt'>,
  from?: Date,
  to?: Date,
): boolean {
  const start = alertStart(alert).getTime();
  if (from && start < from.getTime()) return false;
  if (to && start > to.getTime()) return false;
  return true;
}

export function compareFaultHistory(a: FaultHistoryRow, b: FaultHistoryRow): number {
  const rank = Number(isUnclosed(b)) - Number(isUnclosed(a));
  if (rank !== 0) return rank;
  const time = alertStart(b).getTime() - alertStart(a).getTime();
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function selectFaultHistory(
  alerts: FaultHistoryRow[],
  options: FaultHistoryOptions,
): FaultHistoryRow[] {
  const matched = alerts.filter((alert) =>
    matchesFaultHistoryCategory(alert, options.includeConnectivity),
  );
  const opened = matched.filter((alert) => inWindow(alert, options.from, options.to));
  let chosen: FaultHistoryRow[];
  if (options.focus === 'open') {
    chosen = matched.filter(isUnclosed);
  } else if (options.focus === 'opened') {
    chosen = opened;
  } else {
    const openedIds = new Set(opened.map((alert) => alert.id));
    const pinned = matched.filter(
      (alert) => isUnclosed(alert) && !openedIds.has(alert.id),
    );
    chosen = [...pinned, ...opened];
  }
  return [...chosen].sort(compareFaultHistory);
}

export function summarizeFaultHistory(
  alerts: FaultHistoryRow[],
  options: FaultHistoryOptions,
  now = new Date(),
): FaultHistorySummary {
  const matched = alerts.filter((alert) =>
    matchesFaultHistoryCategory(alert, options.includeConnectivity),
  );
  const opened = matched.filter((alert) => inWindow(alert, options.from, options.to));
  const openedIds = new Set(opened.map((alert) => alert.id));
  const visible = [
    ...matched.filter((alert) => isUnclosed(alert) && !openedIds.has(alert.id)),
    ...opened,
  ];
  let longest: number | null = null;
  for (const alert of visible) {
    const minutes = alertDurationMinutes(alert, now);
    if (longest == null || minutes > longest) longest = minutes;
  }
  return {
    openCount: matched.filter(isUnclosed).length,
    openedInRange: opened.length,
    longestDurationMinutes: longest,
  };
}

export function encodeFaultHistoryCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

export function decodeFaultHistoryCursor(cursor: string): string | null {
  try {
    const id = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!id || id.includes('\0')) return null;
    return id;
  } catch {
    return null;
  }
}

export function pageFaultHistory<T extends { id: string }>(
  rows: T[],
  cursor?: string | null,
): { items: T[]; nextCursor: string | null } {
  let start = 0;
  if (cursor) {
    const id = decodeFaultHistoryCursor(cursor);
    if (!id) return { items: [], nextCursor: null };
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return { items: [], nextCursor: null };
    start = index + 1;
  }
  const items = rows.slice(start, start + FAULT_HISTORY_PAGE_SIZE);
  const last = items[items.length - 1];
  const hasMore = start + items.length < rows.length;
  return {
    items,
    nextCursor: hasMore && last ? encodeFaultHistoryCursor(last.id) : null,
  };
}

export function closedReasonLabel(reason: string | null, status: string): string | null {
  if (status !== 'closed') return null;
  if (!reason?.trim()) return '已关闭';
  return CLOSED_REASON_LABELS[reason] ?? reason;
}

export function faultDpCode(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const code = (detail as { dpCode?: unknown }).dpCode;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

function cleanCopy(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export function pickFaultCopy(
  rows: FaultCopyRow[],
  label: string | null,
  dpCode?: string | null,
): { symptom: string | null; suggestedAction: string | null } {
  if (!label) return { symptom: null, suggestedAction: null };
  const matches = rows.filter((row) => row.label === label);
  const hasCopy = (row: FaultCopyRow) =>
    Boolean(cleanCopy(row.symptom) || cleanCopy(row.suggestedAction));
  const preferred =
    (dpCode ? matches.find((row) => row.code === dpCode && hasCopy(row)) : undefined) ??
    matches.find((row) => row.code === 'fault' && hasCopy(row)) ??
    (dpCode ? matches.find((row) => row.code === dpCode) : undefined) ??
    matches.find((row) => row.code === 'fault') ??
    matches.find(hasCopy) ??
    matches[0];
  return {
    symptom: cleanCopy(preferred?.symptom),
    suggestedAction: cleanCopy(preferred?.suggestedAction),
  };
}
