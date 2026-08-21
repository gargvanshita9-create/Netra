import { isAbsolute, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/**
 * pnpm always runs package scripts with cwd set to the package directory, so
 * the repo root is two levels up — the same assumption AppConfigModule makes
 * when it locates the single root .env.
 */
const REPO_ROOT = resolve(process.cwd(), '..', '..');

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

  /** Absolute path to the synthesis cache. Relative values resolve from the repo root. */
  get ttsCacheDir(): string {
    const configured = this.configService.get('NETRA_TTS_CACHE_DIR', { infer: true });
    return isAbsolute(configured) ? configured : join(REPO_ROOT, configured);
  }

  /** Hand-authored SpeechPackets served in fixture mode. Ships with the app. */
  get speechFixtureDir(): string {
    return join(process.cwd(), 'fixtures', 'speech');
  }

  get ttsUsdPerMillionChars(): number {
    return this.configService.get('NETRA_TTS_USD_PER_MILLION_CHARS', { infer: true });
  }

  get webOrigin(): string {
    return this.configService.get('NETRA_WEB_ORIGIN', { infer: true });
  }
}
