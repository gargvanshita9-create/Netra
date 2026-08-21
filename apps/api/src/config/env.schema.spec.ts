import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const REQUIRED = {
  DATABASE_URL: 'postgres://netra_ro@localhost:5432/netra_demo',
  MONGODB_URL: 'mongodb://localhost:27017/netra',
};

describe('validateEnv', () => {
  it('defaults to fixture mode, so nothing bills by accident', () => {
    expect(validateEnv({ ...REQUIRED }).NETRA_TTS_MODE).toBe('fixture');
  });

  it('treats a blank value as unset rather than as zero or empty', () => {
    // This is what copying .env.example verbatim looks like.
    const env = validateEnv({
      ...REQUIRED,
      PORT: '',
      NETRA_TTS_MODE: '',
      NETRA_TTS_CACHE_DIR: '',
      NETRA_TTS_USD_PER_MILLION_CHARS: '',
      NETRA_WEB_ORIGIN: '',
      AZURE_SPEECH_KEY: '',
    });

    expect(env.PORT).toBe(3000);
    expect(env.NETRA_TTS_MODE).toBe('fixture');
    expect(env.NETRA_TTS_CACHE_DIR).toBe('.cache/tts');
    // A blank price silently metering everything at $0 is the bug this prevents.
    expect(env.NETRA_TTS_USD_PER_MILLION_CHARS).toBe(16);
    expect(env.NETRA_WEB_ORIGIN).toBe('http://localhost:5173');
    expect(env.AZURE_SPEECH_KEY).toBeUndefined();
  });

  it('refuses to start in live mode without Azure credentials', () => {
    expect(() => validateEnv({ ...REQUIRED, NETRA_TTS_MODE: 'live' })).toThrow(
      /AZURE_SPEECH_KEY is required when NETRA_TTS_MODE=live/,
    );
  });

  it('starts in live mode once both credentials are present', () => {
    const env = validateEnv({
      ...REQUIRED,
      NETRA_TTS_MODE: 'live',
      AZURE_SPEECH_KEY: 'key',
      AZURE_SPEECH_REGION: 'centralindia',
    });
    expect(env.NETRA_TTS_MODE).toBe('live');
  });

  it('names the missing variable when a required one is absent', () => {
    expect(() => validateEnv({ MONGODB_URL: REQUIRED.MONGODB_URL })).toThrow(/DATABASE_URL/);
  });
});
