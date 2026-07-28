import { DeviceBusMessage } from './device-bus-message';

export type TuyaDecodedMessage = Record<string, unknown>;

const RESERVED_KEYS = new Set([
  'bizCode',
  'bizData',
  'ts',
  't',
  'productKey',
  'productId',
  'devId',
  'deviceId',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Flatten Tuya `{ bizCode, bizData, ts }` envelopes and infer property reports. */
export function normalizeTuyaMessage(raw: TuyaDecodedMessage): DeviceBusMessage {
  const bizData = asRecord(raw.bizData);
  const merged: TuyaDecodedMessage = bizData ? { ...bizData, ...raw } : { ...raw };

  let bizCode = String(merged.bizCode ?? '');
  if (!bizCode && (Array.isArray(merged.status) || merged.properties != null)) {
    bizCode = 'devicePropertyMessage';
  }

  const ts = Number(merged.ts ?? merged.t ?? Date.now());
  const productId = String(merged.productKey ?? merged.productId ?? '') || undefined;
  const deviceId = String(merged.devId ?? merged.deviceId ?? '');

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!RESERVED_KEYS.has(key)) {
      payload[key] = value;
    }
  }
  if (bizData) {
    for (const [key, value] of Object.entries(bizData)) {
      if (!RESERVED_KEYS.has(key) && payload[key] === undefined) {
        payload[key] = value;
      }
    }
  }

  return { bizCode, ts, productId, deviceId, payload };
}
