import { z } from 'zod';
import type { Emotion, GestureId, SpeechPacket } from '@netra/contracts';

/**
 * Runtime mirror of the frozen `SpeechPacket` contract (PROJECT_PLAN.md §6).
 *
 * `@netra/contracts` is types-only by design (ADR-003), so the zod schema has
 * to live here. The compile-time assertions at the bottom of this file are what
 * stop the two drifting: if someone edits the contract, this stops compiling.
 */

export const GESTURE_IDS = [
  'idle',
  'talking_neutral',
  'talking_emphatic',
  'explaining',
  'pointing',
  'greeting',
  'thinking',
] as const satisfies readonly GestureId[];

export const EMOTIONS = ['neutral', 'positive', 'concerned'] as const satisfies readonly Emotion[];

export const gestureIdSchema = z.enum(GESTURE_IDS);
export const emotionSchema = z.enum(EMOTIONS);

export const visemeFrameSchema = z.object({
  timeMs: z.number().nonnegative(),
  visemeId: z.number().int().min(0).max(21),
});

const speechPacketShape = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    lang: z.string().min(2),
    audioBase64: z.string().min(1).optional(),
    audioUrl: z.string().min(1).optional(),
    audioMimeType: z.string().min(1),
    durationMs: z.number().nonnegative(),
    visemes: z.array(visemeFrameSchema),
    gesture: gestureIdSchema,
    emotion: emotionSchema,
  })
  // "Base64 audio ... or a URL. Exactly one." — the contract's own words.
  .refine((packet) => Boolean(packet.audioBase64) !== Boolean(packet.audioUrl), {
    message: 'A SpeechPacket carries exactly one of audioBase64 or audioUrl, never both or neither.',
  })
  .refine(
    (packet) => packet.visemes.every((frame, i) => i === 0 || frame.timeMs >= (packet.visemes[i - 1]?.timeMs ?? 0)),
    { message: 'visemes must be ordered ascending by timeMs.' },
  );

/**
 * Parses to the frozen contract exactly.
 *
 * The explicit `: SpeechPacket` return annotation is the drift guard: add a
 * required field to the contract and this stops compiling until the schema
 * grows it too.
 *
 * The rebuild is not ceremony. `tsconfig.base.json` sets
 * `exactOptionalPropertyTypes`, under which `audioBase64?: string` means the
 * key is absent or a string — never present-and-undefined, which is what zod's
 * `.optional()` produces. So the optional audio keys are re-attached only when
 * they actually carry a value.
 */
export const speechPacketSchema = speechPacketShape.transform((packet): SpeechPacket => {
  const { audioBase64, audioUrl, ...rest } = packet;
  return {
    ...rest,
    ...(audioBase64 === undefined ? {} : { audioBase64 }),
    ...(audioUrl === undefined ? {} : { audioUrl }),
  };
});
