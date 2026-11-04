import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readDeviceSoftCap } from './config/runtime-profile';
import { describeTuyaClientBoot } from './demo/tuya-client-factory';
import { loadRootEnv } from './load-env';

loadRootEnv();

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const softCap = readDeviceSoftCap();
  logger.log(describeTuyaClientBoot());
  logger.log(
    `DEVICE_SOFT_CAP=${softCap == null ? 'none' : softCap} (warn only; ingest is not truncated)`,
  );
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

bootstrap();
