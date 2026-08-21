import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { SpeechPacket } from '@netra/contracts';
import { AppConfigService } from '../config/app-config.service';
import { fixtureKey, fixtureLanguageKey } from './cache-key';
import { speechPacketSchema } from './speech-packet.schema';

/**
 * Hand-authored SpeechPackets served in `NETRA_TTS_MODE=fixture`.
 *
 * This is the mode that becomes the public demo later (PROJECT_PLAN.md §8), so
 * it must reach the network exactly never. Fixtures are indexed by text+lang
 * and are deliberately voice-agnostic — see `fixtureKey`.
 */
@Injectable()
export class FixtureStoreService implements OnModuleInit {
  private readonly logger = new Logger(FixtureStoreService.name);
  private readonly byTextAndLang = new Map<string, SpeechPacket>();
  /** Same fixtures, keyed without the regional subtag. See `find`. */
  private readonly byTextAndPrimaryLang = new Map<string, SpeechPacket>();

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.byTextAndLang.clear();
    this.byTextAndPrimaryLang.clear();
    const directory = this.config.speechFixtureDir;

    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      this.logger.warn(
        `No speech fixture directory at ${directory} — fixture mode will have nothing to serve.`,
      );
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const raw = await readFile(join(directory, entry), 'utf8');
      const parsed = speechPacketSchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) {
        // Loud, but not fatal: one bad fixture should not stop the API booting.
        this.logger.error(
          `Fixture ${entry} does not match the SpeechPacket contract and was skipped:\n${parsed.error.issues
            .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
            .join('\n')}`,
        );
        continue;
      }
      const packet = parsed.data;
      this.byTextAndLang.set(fixtureKey(packet.text, packet.lang), packet);
      // First fixture wins the region-less slot; an exact-tag match always
      // takes precedence over it in `find`, so this only ever fills a gap.
      const looseKey = fixtureLanguageKey(packet.text, packet.lang);
      if (!this.byTextAndPrimaryLang.has(looseKey)) {
        this.byTextAndPrimaryLang.set(looseKey, packet);
      }
    }

    this.logger.log(`Loaded ${this.byTextAndLang.size} speech fixture(s) from ${directory}.`);
  }

  /**
   * Exact language tag first, then the same language in any region.
   *
   * Without the fallback, asking for "en-IN" cannot reach the greeting recorded
   * as "en-US" — so the product's own default language dead-ends on first
   * contact even when the user types the fixture sentence exactly. The returned
   * packet keeps its own `lang`, so nothing misrepresents what was recorded.
   */
  find(text: string, lang: string): SpeechPacket | null {
    return (
      this.byTextAndLang.get(fixtureKey(text, lang)) ??
      this.byTextAndPrimaryLang.get(fixtureLanguageKey(text, lang)) ??
      null
    );
  }

  /** Sentences fixture mode can currently speak — used in its error message. */
  available(): { text: string; lang: string }[] {
    return [...this.byTextAndLang.values()].map((packet) => ({
      text: packet.text,
      lang: packet.lang,
    }));
  }
}
