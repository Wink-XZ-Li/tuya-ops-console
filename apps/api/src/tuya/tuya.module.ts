import { Module } from '@nestjs/common';
import { createTuyaClient } from '../demo/tuya-client-factory';
import { TUYA_CLIENT } from './tuya.client';

@Module({
  providers: [
    {
      provide: TUYA_CLIENT,
      useFactory: () => createTuyaClient(),
    },
  ],
  exports: [TUYA_CLIENT],
})
export class TuyaModule {}
