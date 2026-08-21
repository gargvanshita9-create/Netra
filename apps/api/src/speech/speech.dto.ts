import { z } from 'zod';
import { emotionSchema, gestureIdSchema } from './speech-packet.schema';

/** Long enough for a narrated analysis paragraph; short enough to bound spend. */
const MAX_TEXT_LENGTH = 1_000;

export const synthesizeRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'text is required — this is the sentence the avatar will speak.')
    .max(MAX_TEXT_LENGTH, `text is limited to ${MAX_TEXT_LENGTH} characters per request.`),
  /** BCP-47, e.g. "en-IN", "hi-IN", "ta-IN". */
  lang: z
    .string()
    .trim()
    .regex(
      /^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Z]{2}|[0-9]{3}))?$/u,
      'lang must be a BCP-47 tag such as "en-IN", "hi-IN" or "ta-IN".',
    ),
  /** Azure voice name. Omitted ⇒ the registered default for `lang`. */
  voice: z.string().trim().min(1).optional(),
  /** Body animation the avatar plays while speaking. */
  gesture: gestureIdSchema.default('talking_neutral'),
  emotion: emotionSchema.default('neutral'),
});

export type SynthesizeRequest = z.infer<typeof synthesizeRequestSchema>;

export interface UsageResponse {
  date: string;
  characters: number;
  requests: number;
  estimatedUsd: number;
  /** False once NETRA_TTS_MODE=live starts billing — useful in the response. */
  billable: boolean;
}
