import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readAppProfile, readDeviceSoftCap } from './config/runtime-profile';
import { loadRootEnv } from './load-env';

loadRootEnv();

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const softCap = readDeviceSoftCap();
  logger.log(
    `APP_PROFILE=${readAppProfile()} DEMO_MODE=${process.env.DEMO_MODE ?? 'mock'} (Tuya client only)`,
  );
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
