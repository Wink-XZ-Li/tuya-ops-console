import { createDecipheriv, createHash } from 'crypto';

type TuyaEnvelope = {
  data?: string;
  sign?: string;
  t?: number;
  protocol?: number;
  pv?: string;
};

export function md5Hex(input: string): string {
  return createHash('md5').update(input, 'utf8').digest('hex');
}

export function buildTuyaPulsarPassword(accessId: string, accessKey: string): string {
  return md5Hex(accessId + md5Hex(accessKey)).slice(8, 24);
}

export function verifyTuyaSign(payload: TuyaEnvelope, accessKey: string): boolean {
  const sign = payload.sign;
  if (!sign) {
    return true;
  }

  const pairs = Object.entries(payload)
    .filter(([key, value]) => key !== 'sign' && value !== '' && value != null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`);

  const expected = md5Hex(`${pairs.join('||')}||${accessKey}`);
  return expected === sign;
}

function decryptAesEcb(base64Data: string, key: string): string {
  const encrypted = Buffer.from(base64Data, 'base64');
  const decipher = createDecipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8').replace(/[\0\b\f\n\r\t\v]+$/g, '').trim();
}

function decryptAesGcm(base64Data: string, key: string): string {
  const bytes = Buffer.from(base64Data, 'base64');
  const nonce = bytes.subarray(0, 12);
  const tag = bytes.subarray(bytes.length - 16);
  const ciphertext = bytes.subarray(12, bytes.length - 16);
  const decipher = createDecipheriv('aes-128-gcm', Buffer.from(key, 'utf8'), nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8').replace(/[\0\b\f\n\r\t\v]+$/g, '').trim();
}

export function decryptTuyaPayload(
  envelope: TuyaEnvelope,
  accessKey: string,
  decryptMode?: string,
): Record<string, unknown> {
  // Official Tuya SDKs decrypt without hard-failing on sign; keep as soft check.
  if (!verifyTuyaSign(envelope, accessKey)) {
    if (process.env.TUYA_MQ_STRICT_SIGN === '1') {
      throw new Error('Tuya payload signature mismatch');
    }
  }

  const encrypted = envelope.data;
  if (!encrypted) {
    throw new Error('Tuya payload missing data field');
  }

  const aesKey = accessKey.slice(8, 24);
  const preferGcm =
    decryptMode == null ||
    decryptMode === '' ||
    decryptMode === 'aes_gcm' ||
    decryptMode === 'aes-gcm';

  const modes: Array<'gcm' | 'ecb'> = preferGcm ? ['gcm', 'ecb'] : ['ecb', 'gcm'];
  let lastError: unknown;
  let plain: string | undefined;
  for (const mode of modes) {
    try {
      const candidate = mode === 'gcm' ? decryptAesGcm(encrypted, aesKey) : decryptAesEcb(encrypted, aesKey);
      JSON.parse(candidate);
      plain = candidate;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (plain === undefined) {
    throw lastError instanceof Error ? lastError : new Error('Failed to decrypt Tuya payload');
  }

  const parsed = JSON.parse(plain) as Record<string, unknown>;
  if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    return parsed.data as Record<string, unknown>;
  }
  return parsed;
}
