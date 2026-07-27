import { buildTuyaPulsarPassword } from './decrypt';

// pulsar-client exposes token/basic auth helpers; Tuya uses custom auth1 plugin.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PulsarBinding = require('pulsar-client/src/pulsar-binding');

export class AuthenticationTuya {
  binding: unknown;

  constructor(accessId: string, accessKey: string) {
    const password = buildTuyaPulsarPassword(accessId, accessKey);
    const authParams = JSON.stringify({ username: accessId, password });
    this.binding = new PulsarBinding.Authentication('auth1', authParams);
  }
}
