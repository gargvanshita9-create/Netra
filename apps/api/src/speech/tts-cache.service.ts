import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { SpeechPacket } from '@netra/contracts';
import { AppConfigService } from '../config/app-config.service';
import { speechPacketSchema } from './speech-packet.schema';

/**
 * Disk cache for synthesised speech, keyed by hash(text + lang + voice).
 *
 * This is a cost control, not an optimisation (CLAUDE.md §Cost discipline):
 * tuning lip-sync replays one sentence hundreds of times, and only the first
 * play should ever reach Azure. It is also what makes `NETRA_TTS_MODE=fixture`
 * useful rather than merely offline — anything synthesised once stays playable.
 */
@Injectable()
export class TtsCacheService {
  private readonly logger = new Logger(TtsCacheService.name);

  constructor(private readonly config: AppConfigService) {}

  private pathFor(key: string): string {
    return join(this.config.ttsCacheDir, `${key}.json`);
  }

  async read(key: string): Promise<SpeechPacket | null> {
    let raw: string;
    try {
      raw = await readFile(this.pathFor(key), 'utf8');
    } catch {
      return null;
    }

    // A corrupt or stale-shaped entry is a cache miss, never a request failure:
    // the worst case is one re-synthesis, and the alternative is an endpoint
    // that breaks because of a file the user has never heard of.
    const parsed = speechPacketSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      this.logger.warn(
        `Discarding malformed TTS cache entry ${key}.json — it does not match the SpeechPacket contract.`,
      );
      return null;
    }
    return parsed.data;
  }

  async write(key: string, packet: SpeechPacket): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(this.config.ttsCacheDir, { recursive: true });
    // Write-then-rename: a crash mid-write leaves no half-file for the next
    // process to parse.
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(packet), 'utf8');
    await rename(temporary, target);
  }
}
