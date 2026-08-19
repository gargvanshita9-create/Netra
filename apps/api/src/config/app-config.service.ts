import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/** The only place in the app allowed to read process.env — everything else reads this. */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  get port(): number {
    return this.configService.get('PORT', { infer: true });
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL', { infer: true });
  }

  get mongodbUrl(): string {
    return this.configService.get('MONGODB_URL', { infer: true });
  }

  get ttsMode(): 'fixture' | 'live' {
    return this.configService.get('NETRA_TTS_MODE', { infer: true });
  }

  get azureSpeechKey(): string | undefined {
    return this.configService.get('AZURE_SPEECH_KEY', { infer: true });
  }

  get azureSpeechRegion(): string | undefined {
    return this.configService.get('AZURE_SPEECH_REGION', { infer: true });
  }
}
