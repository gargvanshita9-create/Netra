import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './health/health.module';
import { SpeechModule } from './speech/speech.module';

@Module({
  imports: [AppConfigModule, HealthModule, SpeechModule],
})
export class AppModule {}
