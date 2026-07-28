import { Logger, Module } from '@nestjs/common';
import { TUYA_CLIENT, TuyaLiveClient } from './tuya.client';
import { TuyaMockClient } from './tuya.mock';

@Module({
  providers: [
    {
      provide: TUYA_CLIENT,
      useFactory: () => {
        const logger = new Logger('TuyaModule');
        if (process.env.DEMO_MODE === 'live') {
          logger.log('Using TuyaLiveClient (OpenAPI)');
          return new TuyaLiveClient();
        }
        logger.warn('Using TuyaMockClient — set DEMO_MODE=live and load root .env for real devices');
        return new TuyaMockClient();
      },
    },
  ],
  exports: [TUYA_CLIENT],
})
export class TuyaModule {}
