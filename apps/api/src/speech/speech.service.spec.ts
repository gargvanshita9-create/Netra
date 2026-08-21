import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import type { AzureTtsService, SynthesisResult } from './azure-tts.service';
import { FixtureStoreService } from './fixture-store.service';
import { SpeechService } from './speech.service';
import { SpendCounterService } from './spend-counter.service';
import { TtsCacheService } from './tts-cache.service';
import type { SynthesizeRequest } from './speech.dto';

/** The greeting shipped in apps/api/fixtures/speech. */
const FIXTURE_TEXT = "Hi, I'm Netra. Ask me anything about your data, and I'll find the answer.";
const FIXTURE_LANG = 'en-US';

/**
 * A stand-in for Azure that records how often it was asked to synthesise.
 * Any call to it in fixture mode is a failure of the mode's core promise.
 */
class FakeAzure {
  calls: { text: string; lang: string; voice: string }[] = [];

  synthesize(text: string, lang: string, voice: string): Promise<SynthesisResult> {
    this.calls.push({ text, lang, voice });
    return Promise.resolve({
      audio: Buffer.from('fake-mp3-bytes'),
      mimeType: 'audio/mpeg',
      durationMs: 1200,
      visemes: [
        { timeMs: 0, visemeId: 0 },
        { timeMs: 120, visemeId: 21 },
        { timeMs: 300, visemeId: 2 },
      ],
    });
  }
}

function request(overrides: Partial<SynthesizeRequest> = {}): SynthesizeRequest {
  return {
    text: FIXTURE_TEXT,
    lang: FIXTURE_LANG,
    gesture: 'talking_neutral',
    emotion: 'neutral',
    ...overrides,
  };
}

describe('SpeechService', () => {
  let cacheDir: string;
  let azure: FakeAzure;

  const buildConfig = (mode: 'fixture' | 'live'): AppConfigService =>
    ({
      ttsMode: mode,
      ttsCacheDir: cacheDir,
      speechFixtureDir: join(process.cwd(), 'fixtures', 'speech'),
      ttsUsdPerMillionChars: 16,
      azureSpeechKey: mode === 'live' ? 'test-key' : undefined,
      azureSpeechRegion: mode === 'live' ? 'centralindia' : undefined,
    }) as unknown as AppConfigService;

  const buildService = async (
    mode: 'fixture' | 'live',
  ): Promise<{ service: SpeechService; spend: SpendCounterService }> => {
    const config = buildConfig(mode);
    const fixtures = new FixtureStoreService(config);
    await fixtures.load();
    const spend = new SpendCounterService(config);
    const service = new SpeechService(
      config,
      new TtsCacheService(config),
      fixtures,
      azure as unknown as AzureTtsService,
      spend,
    );
    return { service, spend };
  };

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'netra-tts-'));
    azure = new FakeAzure();
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  describe('fixture mode', () => {
    it('serves a hand-authored packet without reaching Azure', async () => {
      const { service, spend } = await buildService('fixture');

      const packet = await service.synthesize(request());

      expect(packet.text).toBe(FIXTURE_TEXT);
      expect(packet.visemes.length).toBeGreaterThan(0);
      expect(packet.audioBase64).toBeTruthy();
      // The promise of NETRA_TTS_MODE=fixture: no network calls, ever.
      expect(azure.calls).toHaveLength(0);
      expect((await spend.usage()).characters).toBe(0);
    });

    it('applies the requested gesture and emotion over the fixture defaults', async () => {
      const { service } = await buildService('fixture');

      const packet = await service.synthesize(
        request({ gesture: 'explaining', emotion: 'concerned' }),
      );

      expect(packet.gesture).toBe('explaining');
      expect(packet.emotion).toBe('concerned');
    });

    it('reaches an en-US recording from an en-IN request', async () => {
      const { service } = await buildService('fixture');

      // The product defaults to en-IN and the only shipped fixture is en-US.
      // Without the region fallback this exact pairing — the most likely first
      // thing a user does — is the one combination that cannot succeed.
      const packet = await service.synthesize(request({ lang: 'en-IN' }));

      expect(packet.text).toBe(FIXTURE_TEXT);
      // The packet keeps the language it was actually recorded in.
      expect(packet.lang).toBe('en-US');
      expect(azure.calls).toHaveLength(0);
    });

    it('does not cross languages when falling back', async () => {
      const { service } = await buildService('fixture');

      await expect(service.synthesize(request({ lang: 'hi-IN' }))).rejects.toThrow(
        /fixture speech mode/i,
      );
    });

    it('does not demand a voice it will never use', async () => {
      const { service } = await buildService('fixture');

      // fi-FI has no registered default voice. In fixture mode that is
      // irrelevant — the failure must be about the missing fixture, not a voice.
      await expect(service.synthesize(request({ text: 'Hei', lang: 'fi-FI' }))).rejects.toThrow(
        /fixture speech mode/i,
      );
    });

    it('explains what to do when no fixture matches, rather than failing blankly', async () => {
      const { service } = await buildService('fixture');

      await expect(service.synthesize(request({ text: 'An unrecorded sentence.' }))).rejects.toThrow(
        /NETRA_TTS_MODE=live|add a fixture/i,
      );
      expect(azure.calls).toHaveLength(0);
    });
  });

  describe('live mode', () => {
    it('synthesises once, then serves the cache — the cost-discipline requirement', async () => {
      const { service, spend } = await buildService('live');
      const text = 'Deposits grew nine percent last quarter.';

      const first = await service.synthesize(request({ text, lang: 'en-IN' }));
      const second = await service.synthesize(request({ text, lang: 'en-IN' }));

      expect(azure.calls).toHaveLength(1);
      expect(second.id).toBe(first.id);
      expect(second.audioBase64).toBe(first.audioBase64);
      // Only the billed synthesis is counted; the cache hit is free.
      expect((await spend.usage()).characters).toBe(text.length);
      expect((await spend.usage()).requests).toBe(1);
    });

    it('picks the registered default voice for the language', async () => {
      const { service } = await buildService('live');

      await service.synthesize(request({ text: 'नमस्ते', lang: 'hi-IN' }));

      expect(azure.calls[0]?.voice).toBe('hi-IN-SwaraNeural');
    });

    it('produces a packet that satisfies the frozen contract', async () => {
      const { service } = await buildService('live');

      const packet = await service.synthesize(request({ text: 'Hello there.', lang: 'en-IN' }));

      expect(packet.audioMimeType).toBe('audio/mpeg');
      expect(packet.durationMs).toBe(1200);
      expect(packet.audioUrl).toBeUndefined();
      expect(packet.visemes.map((frame) => frame.timeMs)).toEqual([0, 120, 300]);
      expect(packet.id).toHaveLength(32);
    });

    it('asks for an explicit voice rather than guessing one for an unknown language', async () => {
      const { service } = await buildService('live');

      await expect(service.synthesize(request({ text: 'Hei', lang: 'fi-FI' }))).rejects.toThrow(
        /No default voice is registered/i,
      );
      expect(azure.calls).toHaveLength(0);
    });

    it('honours an explicitly requested voice', async () => {
      const { service } = await buildService('live');

      await service.synthesize(request({ text: 'Hei', lang: 'fi-FI', voice: 'fi-FI-NooraNeural' }));

      expect(azure.calls[0]?.voice).toBe('fi-FI-NooraNeural');
    });
  });
});
