import { Module } from '@nestjs/common';
import { TUYA_CLIENT, TuyaLiveClient } from './tuya.client';
import { TuyaMockClient } from './tuya.mock';

@Module({
  providers: [
    {
      provide: TUYA_CLIENT,
      useFactory: () => {
        if (process.env.DEMO_MODE === 'live') {
          return new TuyaLiveClient();
        }
        return new TuyaMockClient();
      },
    },
  ],
  exports: [TUYA_CLIENT],
})
export class TuyaModule {}
