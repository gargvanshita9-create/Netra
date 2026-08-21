import { Module } from '@nestjs/common';
import { AzureTtsService } from './azure-tts.service';
import { FixtureStoreService } from './fixture-store.service';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';
import { SpendCounterService } from './spend-counter.service';
import { TtsCacheService } from './tts-cache.service';

/**
 * Speech synthesis (PROJECT_PLAN.md §5.1, A6). Azure is specified here for its
 * timestamped viseme event stream, not its voice quality — see §5.3.
 */
@Module({
  controllers: [SpeechController],
  providers: [
    SpeechService,
    AzureTtsService,
    TtsCacheService,
    FixtureStoreService,
    SpendCounterService,
  ],
  exports: [SpeechService],
})
export class SpeechModule {}
