import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { SpeechPacket } from '@netra/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { synthesizeRequestSchema, type SynthesizeRequest, type UsageResponse } from './speech.dto';
import { SpeechService } from './speech.service';

@Controller('speech')
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}

  /**
   * The A6 endpoint: text in, a playable `SpeechPacket` out. Whether it came
   * from Azure, the cache or a fixture is deliberately invisible to the caller.
   */
  @Post('synthesize')
  // 200, not Nest's default 201: this returns a rendering of the text it was
  // given, not a newly created resource with a location of its own.
  @HttpCode(HttpStatus.OK)
  synthesize(
    @Body(new ZodValidationPipe(synthesizeRequestSchema)) request: SynthesizeRequest,
  ): Promise<SpeechPacket> {
    return this.speech.synthesize(request);
  }

  /** Today's Azure Speech spend. Trivial now, deliberately (PROJECT_PLAN.md §8). */
  @Get('usage')
  usage(): Promise<UsageResponse> {
    return this.speech.usage();
  }
}
