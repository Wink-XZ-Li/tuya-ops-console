import { DeviceFaultStatus } from '@prisma/client';

export const FAULT_CODE_PATTERN = /fault|alarm|error|warn|malfunction/i;
export const SIGNAL_CODE_PATTERN = /rssi|signal_strength|wifi_signal|wifi_rssi|signal/i;

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function extractStatusUpdates(payload: Record<string, unknown>): Record<string, unknown> {
  const status = payload.status;
  if (Array.isArray(status)) {
    return status.reduce<Record<string, unknown>>((acc, item) => {
      if (item && typeof item === 'object' && 'code' in item) {
        const row = item as { code: string; value?: unknown };
        acc[row.code] = row.value;
      }
      return acc;
    }, {});
  }

  const properties = payload.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    return { ...(properties as Record<string, unknown>) };
  }

  const { status: _status, properties: _properties, ...rest } = payload;
  return rest;
}

export function statusFromPairs(
  pairs: Array<{ code: string; value: unknown }>,
): Record<string, unknown> {
  return pairs.reduce<Record<string, unknown>>((acc, row) => {
    if (row.code) acc[row.code] = row.value;
    return acc;
  }, {});
}

function isActiveFaultValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (!v || v === '0' || v === 'false' || v === 'ok' || v === 'normal' || v === 'none') {
      return false;
    }
    return true;
  }
  return false;
}

export function collectFaultEntries(
  status: Record<string, unknown>,
): Array<{ code: string; value: unknown }> {
  return Object.entries(status)
    .filter(([code, value]) => FAULT_CODE_PATTERN.test(code) && isActiveFaultValue(value))
    .map(([code, value]) => ({ code, value }));
}

export function deriveFaultFields(
  status: Record<string, unknown>,
  openAlertTitles: string[] = [],
): { faultStatus: DeviceFaultStatus; faultInfo: string | null } {
  const faults = collectFaultEntries(status);
  if (faults.length > 0) {
    return {
      faultStatus: DeviceFaultStatus.fault,
      faultInfo: faults
        .slice(0, 5)
        .map((f) => `${f.code}=${String(f.value)}`)
        .join('; ')
        .slice(0, 512),
    };
  }
  if (openAlertTitles.length > 0) {
    return {
      faultStatus: DeviceFaultStatus.fault,
      faultInfo: openAlertTitles.slice(0, 3).join('; ').slice(0, 512),
    };
  }
  if (Object.keys(status).length === 0 && openAlertTitles.length === 0) {
    return { faultStatus: DeviceFaultStatus.unknown, faultInfo: null };
  }
  return { faultStatus: DeviceFaultStatus.normal, faultInfo: null };
}

export function deriveSignalStrength(status: Record<string, unknown>): string | null {
  for (const [code, value] of Object.entries(status)) {
    if (!SIGNAL_CODE_PATTERN.test(code) || value == null || value === '') continue;
    return String(value).slice(0, 64);
  }
  return null;
}

export function formatLocationText(lat?: string | null, lon?: string | null): string | null {
  if (!lat && !lon) return null;
  if (lat && lon) return `${lat},${lon}`;
  return lat || lon || null;
}
