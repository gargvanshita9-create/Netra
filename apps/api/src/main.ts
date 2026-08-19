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
  await app.listen(config.port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('Netra API failed to start:', error);
  process.exit(1);
});
