import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type { UsageResponse } from './speech.dto';

interface DailySpend {
  date: string;
  characters: number;
  requests: number;
}

/**
 * Daily Azure Speech spend counter.
 *
 * PROJECT_PLAN.md §8 asks for this now, while the numbers are trivial, because
 * it will not be trivial in Phase 5. Only real syntheses are recorded — cache
 * hits and fixtures cost nothing and must not inflate the number.
 */
@Injectable()
export class SpendCounterService {
  private readonly logger = new Logger(SpendCounterService.name);
  /** Serialises read-modify-write so concurrent requests cannot lose a count. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly config: AppConfigService) {}

  private get directory(): string {
    return join(this.config.ttsCacheDir, 'spend');
  }

  private pathFor(date: string): string {
    return join(this.directory, `${date}.json`);
  }

  private today(): string {
    // Deliberately UTC: a counter that resets at a different hour depending on
    // where the server runs is a counter nobody trusts.
    return new Date().toISOString().slice(0, 10);
  }

  private async readDay(date: string): Promise<DailySpend> {
    try {
      const raw = await readFile(this.pathFor(date), 'utf8');
      const parsed = JSON.parse(raw) as Partial<DailySpend>;
      return {
        date,
        characters: typeof parsed.characters === 'number' ? parsed.characters : 0,
        requests: typeof parsed.requests === 'number' ? parsed.requests : 0,
      };
    } catch {
      return { date, characters: 0, requests: 0 };
    }
  }

  /**
   * Records one billed synthesis. Never throws: losing a spend line must not
   * fail a request the user already paid Azure for.
   */
  async record(characters: number): Promise<void> {
    this.queue = this.queue.then(async () => {
      const date = this.today();
      const day = await this.readDay(date);
      day.characters += characters;
      day.requests += 1;
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(this.pathFor(date), JSON.stringify(day), 'utf8');
      } catch (error) {
        this.logger.warn(`Could not persist the TTS spend counter: ${String(error)}`);
      }
      this.logger.log(
        `Azure TTS: +${characters} chars (${date} total ${day.characters}, ~$${this.usd(day.characters).toFixed(4)}).`,
      );
    });
    return this.queue;
  }

  private usd(characters: number): number {
    return (characters / 1_000_000) * this.config.ttsUsdPerMillionChars;
  }

  async usage(): Promise<UsageResponse> {
    const day = await this.readDay(this.today());
    return {
      date: day.date,
      characters: day.characters,
      requests: day.requests,
      estimatedUsd: Number(this.usd(day.characters).toFixed(4)),
      billable: this.config.ttsMode === 'live',
    };
  }
}
