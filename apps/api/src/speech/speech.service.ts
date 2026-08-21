import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { SpeechPacket } from '@netra/contracts';
import { AppConfigService } from '../config/app-config.service';
import { AzureTtsService } from './azure-tts.service';
import { normaliseText, ttsCacheKey } from './cache-key';
import { FixtureStoreService } from './fixture-store.service';
import { speechPacketSchema } from './speech-packet.schema';
import { SpendCounterService } from './spend-counter.service';
import type { SynthesizeRequest, UsageResponse } from './speech.dto';
import { TtsCacheService } from './tts-cache.service';
import { defaultVoiceForLang, knownLanguages } from './voices';

/**
 * Turns a synthesis request into a `SpeechPacket` — the frozen contract the
 * avatar consumes (PROJECT_PLAN.md §6).
 *
 * A6's whole point is that this is indistinguishable from a fixture to the
 * consumer: the avatar layer cannot tell whether it is playing hand-authored
 * JSON, a cache hit, or a live Azure synthesis, and needs no change for any of
 * them. If it ever needs one, the contract was wrong — fix the contract.
 */
@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly cache: TtsCacheService,
    private readonly fixtures: FixtureStoreService,
    private readonly azure: AzureTtsService,
    private readonly spend: SpendCounterService,
  ) {}

  async synthesize(request: SynthesizeRequest): Promise<SpeechPacket> {
    const text = normaliseText(request.text);
    const { lang, gesture, emotion } = request;
    // Deliberately not resolved eagerly: fixture lookup is voice-agnostic, so
    // demanding a voice here would make a fixture in a language with no
    // registered default voice unreachable.
    const voice = request.voice ?? defaultVoiceForLang(lang);

    if (voice) {
      const key = ttsCacheKey(text, lang, voice);
      const cached = await this.cache.read(key);
      if (cached) {
        this.logger.debug(`TTS cache hit ${key} — no Azure call, no spend.`);
        return { ...cached, gesture, emotion };
      }
    }

    if (this.config.ttsMode === 'fixture') {
      const fixture = this.fixtures.find(text, lang);
      if (fixture) return { ...fixture, gesture, emotion };
      throw this.fixtureModeMiss(text, lang);
    }

    if (!voice) throw this.noDefaultVoice(lang);
    const key = ttsCacheKey(text, lang, voice);
    const result = await this.azure.synthesize(text, lang, voice);
    await this.spend.record(text.length);

    const packet: SpeechPacket = {
      id: key,
      text,
      lang,
      audioBase64: result.audio.toString('base64'),
      audioMimeType: result.mimeType,
      durationMs: result.durationMs,
      visemes: result.visemes,
      gesture,
      emotion,
    };

    // Validate on the way out, not just on the way in: this endpoint is the
    // first producer of the frozen contract, and a packet that violates it
    // should fail here rather than as a mystery in the render loop.
    const validated = speechPacketSchema.parse(packet);
    await this.cache.write(key, validated);
    return validated;
  }

  usage(): Promise<UsageResponse> {
    return this.spend.usage();
  }

  private noDefaultVoice(lang: string): BadRequestException {
    return new BadRequestException(
      `No default voice is registered for "${lang}". Pass an explicit "voice" (any Azure ` +
        `neural voice name), or use one of: ${knownLanguages().join(', ')}.`,
    );
  }

  private fixtureModeMiss(text: string, lang: string): ServiceUnavailableException {
    const available = this.fixtures.available();
    const list =
      available.length > 0
        ? available.map((entry) => `  - [${entry.lang}] ${entry.text}`).join('\n')
        : '  (none — the fixture directory is empty)';
    return new ServiceUnavailableException(
      `Netra is in fixture speech mode and has nothing recorded for this sentence in ${lang}. ` +
        'Either set NETRA_TTS_MODE=live with AZURE_SPEECH_KEY and AZURE_SPEECH_REGION to ' +
        `synthesise it, or add a fixture to ${this.config.speechFixtureDir}.\n` +
        `Sentence requested: "${text}"\nFixtures currently available:\n${list}`,
    );
  }
}
