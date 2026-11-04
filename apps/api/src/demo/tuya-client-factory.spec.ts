import { TuyaLiveClient } from '../tuya/tuya.client';
import { TuyaMockClient } from '../tuya/tuya.mock';
import {
  createTuyaClient,
  describeTuyaClientBoot,
  selectTuyaClientKind,
} from './tuya-client-factory';

describe('selectTuyaClientKind', () => {
  it('refuses the mock client when the profile is production', () => {
    expect(() =>
      selectTuyaClientKind({ APP_PROFILE: 'production', DEMO_MODE: 'mock' }),
    ).toThrow(/refuses TuyaMockClient/);
    expect(() => selectTuyaClientKind({ APP_PROFILE: 'production' })).toThrow(
      /refuses TuyaMockClient/,
    );
    expect(selectTuyaClientKind({ APP_PROFILE: 'production', DEMO_MODE: 'live' })).toBe('live');
  });

  it('keeps the mock client on the demo profile unless DEMO_MODE=live', () => {
    expect(selectTuyaClientKind({ APP_PROFILE: 'demo' })).toBe('mock');
    expect(selectTuyaClientKind({ APP_PROFILE: 'demo', DEMO_MODE: 'live' })).toBe('live');
  });

  it('constructs the client the profile allows', () => {
    expect(createTuyaClient({ APP_PROFILE: 'demo', DEMO_MODE: 'mock' })).toBeInstanceOf(
      TuyaMockClient,
    );
    expect(createTuyaClient({ APP_PROFILE: 'production', DEMO_MODE: 'live' })).toBeInstanceOf(
      TuyaLiveClient,
    );
    expect(describeTuyaClientBoot({ APP_PROFILE: 'production', DEMO_MODE: 'live' })).toContain(
      'cannot replace live',
    );
  });
});
