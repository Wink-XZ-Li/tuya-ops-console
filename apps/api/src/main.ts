import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadRootEnv } from './load-env';

loadRootEnv();

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logger.log(`DEMO_MODE=${process.env.DEMO_MODE ?? 'mock'} (Tuya client)`);
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
