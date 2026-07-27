import { DeviceBusMessage } from './device-bus-message';

export type TuyaDecodedMessage = Record<string, unknown>;

const RESERVED_KEYS = new Set([
  'bizCode',
  'ts',
  't',
  'productKey',
  'productId',
  'devId',
  'deviceId',
]);

export function normalizeTuyaMessage(raw: TuyaDecodedMessage): DeviceBusMessage {
  const bizCode = String(raw.bizCode ?? '');
  const ts = Number(raw.ts ?? raw.t ?? Date.now());
  const productId = String(raw.productKey ?? raw.productId ?? '') || undefined;
  const deviceId = String(raw.devId ?? raw.deviceId ?? '');

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!RESERVED_KEYS.has(key)) {
      payload[key] = value;
    }
  }

  return { bizCode, ts, productId, deviceId, payload };
}
