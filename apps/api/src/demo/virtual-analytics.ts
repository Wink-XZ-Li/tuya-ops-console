import type { TuyaClient } from '../tuya/tuya.client';
import { TuyaMockClient } from '../tuya/tuya.mock';

let virtualClient: TuyaMockClient | undefined;

/**
 * Mock chart series for an explicit demo request.
 * Callers must already have rejected production and quota fallback.
 */
export function virtualAnalyticsClient(): TuyaClient {
  virtualClient ??= new TuyaMockClient();
  return virtualClient;
}

export function isMockTuyaClient(client: unknown): boolean {
  return client instanceof TuyaMockClient;
}
