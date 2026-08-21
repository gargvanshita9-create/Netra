import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const config = app.get(AppConfigService);
  // The web app is served from a different origin in dev (Vite on :5173).
  // Named explicitly rather than wildcarded so this stays honest in deploy.
  app.enableCors({ origin: config.webOrigin });
  await app.listen(config.port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('Netra API failed to start:', error);
  process.exit(1);
});
