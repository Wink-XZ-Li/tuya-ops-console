import { Logger } from '@nestjs/common';
import { readAppProfile } from '../config/runtime-profile';
import { TuyaClient, TuyaLiveClient } from '../tuya/tuya.client';
import { TuyaMockClient } from '../tuya/tuya.mock';

export type TuyaClientKind = 'live' | 'mock';

/**
 * Production never constructs TuyaMockClient.
 * Demo uses the mock client unless DEMO_MODE=live.
 */
export function selectTuyaClientKind(env: NodeJS.ProcessEnv = process.env): TuyaClientKind {
  const profile = readAppProfile(env);
  const mode = (env.DEMO_MODE ?? 'mock').trim().toLowerCase() || 'mock';
  if (profile === 'production' && mode !== 'live') {
    throw new Error(
      'APP_PROFILE=production refuses TuyaMockClient. Set DEMO_MODE=live. Virtual analytics cannot replace the live client.',
    );
  }
  return mode === 'live' ? 'live' : 'mock';
}

export function describeTuyaClientBoot(env: NodeJS.ProcessEnv = process.env): string {
  const profile = readAppProfile(env);
  const mode = (env.DEMO_MODE ?? 'mock').trim().toLowerCase() || 'mock';
  const kind = selectTuyaClientKind(env);
  if (kind === 'live') {
    return `APP_PROFILE=${profile} DEMO_MODE=${mode} TuyaLiveClient; virtual analytics cannot replace live`;
  }
  return `APP_PROFILE=${profile} DEMO_MODE=${mode} TuyaMockClient; analytics stay live unless X-Demo-Analytics: virtual or DEMO_ANALYTICS=virtual`;
}

export function createTuyaClient(env: NodeJS.ProcessEnv = process.env): TuyaClient {
  const logger = new Logger('TuyaModule');
  const kind = selectTuyaClientKind(env);
  if (kind === 'live') {
    logger.log('Using TuyaLiveClient (OpenAPI)');
    return new TuyaLiveClient();
  }
  logger.warn('Using TuyaMockClient — demo profile only. Production refuses this client.');
  return new TuyaMockClient();
}
