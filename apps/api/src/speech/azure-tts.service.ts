import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  ResultReason,
  SpeechConfig,
  SpeechSynthesisOutputFormat,
  SpeechSynthesizer,
  type SpeechSynthesisResult,
} from 'microsoft-cognitiveservices-speech-sdk';
import type { VisemeFrame } from '@netra/contracts';
import { AppConfigService } from '../config/app-config.service';
import { normaliseVisemeTimeline, resolveDurationMs, ticksToMs } from './viseme-timeline';

export interface SynthesisResult {
  audio: Buffer;
  mimeType: string;
  durationMs: number;
  visemes: VisemeFrame[];
}

/** 24 kHz / 48 kbit mono MP3 — speech-shaped, and small enough to inline as base64. */
const OUTPUT_FORMAT = SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
const OUTPUT_MIME_TYPE = 'audio/mpeg';

function escapeXml(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

/**
 * SSML rather than plain text so the language and voice are stated explicitly
 * rather than inferred from config, and so `mstts:viseme` can request the
 * viseme ID stream. `redlips_front` is the type that yields numeric viseme IDs;
 * `FacialExpression` would yield blend-shape JSON instead, which is not what
 * the frozen contract carries.
 */
function buildSsml(text: string, lang: string, voice: string): string {
  return [
    '<speak version="1.0"',
    ' xmlns="http://www.w3.org/2001/10/synthesis"',
    ' xmlns:mstts="http://www.w3.org/2001/mstts"',
    ` xml:lang="${escapeXml(lang)}">`,
    `<voice name="${escapeXml(voice)}">`,
    '<mstts:viseme type="redlips_front"/>',
    escapeXml(text),
    '</voice></speak>',
  ].join('');
}

/**
 * Azure Speech synthesis with the timestamped viseme event stream.
 *
 * The viseme stream is the entire reason Azure is specified over a
 * better-sounding provider (PROJECT_PLAN.md §5.3) — it is what makes lip-sync
 * phoneme-driven across 100+ languages rather than English-only heuristics.
 * Note it is only available through the SDK's event callbacks; the REST TTS
 * endpoint returns audio alone, which is why this dependency exists.
 */
@Injectable()
export class AzureTtsService {
  private readonly logger = new Logger(AzureTtsService.name);

  constructor(private readonly config: AppConfigService) {}

  private createSpeechConfig(): SpeechConfig {
    const key = this.config.azureSpeechKey;
    const region = this.config.azureSpeechRegion;
    if (!key || !region) {
      // Startup validation should have caught this; this is the second line.
      throw new ServiceUnavailableException(
        'Azure Speech is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env, ' +
          'or set NETRA_TTS_MODE=fixture to run entirely from cached and hand-authored speech.',
      );
    }
    const speechConfig = SpeechConfig.fromSubscription(key, region);
    speechConfig.speechSynthesisOutputFormat = OUTPUT_FORMAT;
    return speechConfig;
  }

  async synthesize(text: string, lang: string, voice: string): Promise<SynthesisResult> {
    const speechConfig = this.createSpeechConfig();
    // `null`, not undefined: undefined makes the SDK open the default speaker,
    // which is meaningless on a server and fails on a headless host.
    const synthesizer = new SpeechSynthesizer(speechConfig, null);
    const visemes: VisemeFrame[] = [];

    synthesizer.visemeReceived = (_sender, event) => {
      visemes.push({ timeMs: ticksToMs(event.audioOffset), visemeId: event.visemeId });
    };

    try {
      const result = await new Promise<SpeechSynthesisResult>((resolve, reject) => {
        synthesizer.speakSsmlAsync(
          buildSsml(text, lang, voice),
          (value) => resolve(value),
          (error) => reject(new Error(error)),
        );
      });

      if (result.reason !== ResultReason.SynthesizingAudioCompleted) {
        throw new ServiceUnavailableException(
          `Azure Speech did not return audio for "${lang}" / voice "${voice}". ` +
            `${result.errorDetails || 'No further detail was given.'} ` +
            'Check the voice name is available in your region, and that the key and region match.',
        );
      }

      const normalised = normaliseVisemeTimeline(visemes);
      if (normalised.length === 0) {
        // Not fatal — the avatar falls back to amplitude-driven jaw motion —
        // but it silently halves lip-sync quality, so say so.
        this.logger.warn(
          `Azure returned no viseme events for "${lang}" / voice "${voice}". The avatar will ` +
            'fall back to amplitude-driven jaw motion for this packet.',
        );
      }

      return {
        audio: Buffer.from(result.audioData),
        mimeType: OUTPUT_MIME_TYPE,
        durationMs: resolveDurationMs(result.audioDuration, normalised),
        visemes: normalised,
      };
    } finally {
      synthesizer.close();
    }
  }
}
