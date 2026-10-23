/** OTA messages stored on DeviceEvent. Progress ticks are not version changes. */
export const FIRMWARE_BIZ_CODES = ['deviceOtaProgress', 'upgradeStatus'] as const;

export type ChangeMarkerKind = 'firmware' | 'command';

export type ChangeMarker = {
  t: string;
  kind: ChangeMarkerKind;
  label: string;
  detail: string | null;
};

const SUCCESS_STATUS = new Set(['3', 'success', 'succeeded', 'upgrade_success', 'upgraded']);

/**
 * A firmware marker is a completed upgrade, or an event that names both the old and new version.
 * In-progress percentages and the live upgrade-infos snapshot are not markers.
 */
export function firmwareMarkerFromPayload(payload: unknown, eventTime: Date): ChangeMarker | null {
  const records = nestedRecords(payload);
  if (records.length === 0 || Number.isNaN(eventTime.getTime())) return null;

  let status: unknown;
  let oldVersion: string | null = null;
  let nextVersion: string | null = null;
  for (const record of records) {
    if (status == null) status = record.upgradeStatus ?? record.upgrade_status;
    oldVersion =
      oldVersion ?? readString(record, ['oldVersion', 'old_version', 'lastVersion', 'last_version']);
    nextVersion =
      nextVersion ??
      readString(record, [
        'newVersion',
        'new_version',
        'firmwareVersion',
        'firmware_version',
        'version',
        'currentVersion',
        'current_version',
      ]);
  }

  const changed = Boolean(oldVersion && nextVersion && oldVersion !== nextVersion);
  if (!isUpgradeSuccess(status) && !changed) return null;

  const detail = changed ? `${oldVersion} → ${nextVersion}` : nextVersion || oldVersion;
  return {
    t: eventTime.toISOString(),
    kind: 'firmware',
    label: '固件升级',
    detail,
  };
}

/** Only a logged successful command becomes a marker. Failures are omitted. */
export function commandMarker(input: {
  createdAt: Date;
  code: string;
  value: unknown;
  success: boolean;
}): ChangeMarker | null {
  if (!input.success) return null;
  const code = input.code.trim();
  if (!code || Number.isNaN(input.createdAt.getTime())) return null;
  const detail = summarizeValue(input.value);
  return {
    t: input.createdAt.toISOString(),
    kind: 'command',
    label: `指令 ${code}`,
    detail,
  };
}

export function buildChangeMarkers(input: {
  from: Date;
  to: Date;
  firmwareEvents: Array<{ payload: unknown; eventTime: Date }>;
  commands: Array<{ createdAt: Date; code: string; value: unknown; success: boolean }>;
}): { markers: ChangeMarker[] } {
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return { markers: [] };

  const markers: ChangeMarker[] = [];
  for (const event of input.firmwareEvents) {
    const marker = firmwareMarkerFromPayload(event.payload, event.eventTime);
    if (marker && inWindow(marker.t, fromMs, toMs)) markers.push(marker);
  }
  for (const command of input.commands) {
    const marker = commandMarker(command);
    if (marker && inWindow(marker.t, fromMs, toMs)) markers.push(marker);
  }

  markers.sort((a, b) => a.t.localeCompare(b.t) || a.kind.localeCompare(b.kind));
  const unique: ChangeMarker[] = [];
  for (const marker of markers) {
    const last = unique[unique.length - 1];
    if (
      last &&
      last.t === marker.t &&
      last.kind === marker.kind &&
      last.label === marker.label &&
      last.detail === marker.detail
    ) {
      continue;
    }
    unique.push(marker);
  }
  return { markers: unique };
}

function inWindow(iso: string, fromMs: number, toMs: number): boolean {
  const time = Date.parse(iso);
  return Number.isFinite(time) && time >= fromMs && time <= toMs;
}

function isUpgradeSuccess(status: unknown): boolean {
  if (typeof status === 'number' && Number.isFinite(status)) return SUCCESS_STATUS.has(String(status));
  if (typeof status !== 'string') return false;
  return SUCCESS_STATUS.has(status.trim().toLowerCase());
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function nestedRecords(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const root = payload as Record<string, unknown>;
  const records = [root];
  for (const key of ['bizData', 'data']) {
    const nested = root[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      records.push(nested as Record<string, unknown>);
    }
  }
  return records;
}

function summarizeValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let text = '';
  try {
    text = JSON.stringify(value);
  } catch {
    return null;
  }
  if (!text || text === '{}' || text === '[]') return null;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}
