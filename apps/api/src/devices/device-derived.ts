import { DeviceFaultStatus } from '@prisma/client';
import { getFaultBitmapLabels } from './product-fault-schemas';

export const FAULT_CODE_PATTERN = /fault|alarm|error|warn|malfunction/i;
export const SIGNAL_CODE_PATTERN = /rssi|signal_strength|wifi_signal|wifi_rssi|signal/i;

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function extractStatusUpdates(payload: Record<string, unknown>): Record<string, unknown> {
  const fromCodeValueArray = (items: unknown): Record<string, unknown> | null => {
    if (!Array.isArray(items)) return null;
    const out: Record<string, unknown> = {};
    for (const item of items) {
      if (item && typeof item === 'object' && 'code' in item) {
        const row = item as { code: string; value?: unknown };
        if (row.code) out[row.code] = row.value;
      }
    }
    return out;
  };

  const fromStatus = fromCodeValueArray(payload.status);
  if (fromStatus) return fromStatus;

  // IoT Core property messages: { properties: [{ code, dpId, value, time }, ...] }
  const fromPropertiesArr = fromCodeValueArray(payload.properties);
  if (fromPropertiesArr) return fromPropertiesArr;

  const properties = payload.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    return { ...(properties as Record<string, unknown>) };
  }

  // Avoid treating envelope fields (dataId, etc.) as DP codes.
  const { status: _s, properties: _p, dataId: _d, ...rest } = payload;
  const nested = asRecord(rest.data);
  if (Object.keys(nested).length > 0) {
    const nestedUpdates = extractStatusUpdates(nested);
    if (Object.keys(nestedUpdates).length > 0) return nestedUpdates;
  }
  return {};
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

/** Decode Tuya bitmap value → active label names (bit i → labels[i]). */
export function decodeBitmapLabels(value: unknown, labels: string[]): string[] {
  let n: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    n = value >>> 0;
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    n = Number(value.trim()) >>> 0;
  } else if (typeof value === 'boolean') {
    return value && labels[0] ? [labels[0]] : [];
  }
  if (n == null || n === 0) return [];

  const names: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (n & (1 << i)) names.push(labels[i]);
  }
  return names;
}

export function formatFaultEntry(
  code: string,
  value: unknown,
  productId?: string | null,
): string {
  const raw = `${code}=${String(value)}`;
  const labels = getFaultBitmapLabels(productId, code);
  if (!labels) return raw;
  const names = decodeBitmapLabels(value, labels);
  if (names.length === 0) return raw;
  return `${raw}｜${names.join('+')}`;
}

export type OpenFaultAlert = { faultCode: string | null; title: string };

export type DeriveFaultOptions = {
  productId?: string | null;
  /** Active alerts with category=fault only. Connectivity alerts must not be passed in. */
  openFaultAlerts?: OpenFaultAlert[];
};

export function deriveFaultFields(
  status: Record<string, unknown>,
  options: DeriveFaultOptions = {},
): { faultStatus: DeviceFaultStatus; faultInfo: string | null } {
  const productId = options.productId;
  const openFaultAlerts = options.openFaultAlerts ?? [];
  const faults = collectFaultEntries(status);
  if (faults.length > 0) {
    return {
      faultStatus: DeviceFaultStatus.fault,
      faultInfo: faults
        .slice(0, 5)
        .map((f) => formatFaultEntry(f.code, f.value, productId))
        .join('; ')
        .slice(0, 512),
    };
  }
  if (openFaultAlerts.length > 0) {
    const labels = openFaultAlerts
      .map((alert) => alert.faultCode?.trim() || alert.title)
      .filter((label) => label.length > 0);
    return {
      faultStatus: DeviceFaultStatus.fault,
      faultInfo: labels.slice(0, 3).join('; ').slice(0, 512) || null,
    };
  }
  if (Object.keys(status).length === 0) {
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
