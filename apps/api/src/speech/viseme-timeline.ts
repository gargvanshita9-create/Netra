import type { VisemeFrame } from '@netra/contracts';

/**
 * Azure reports `audioOffset` in 100-nanosecond ticks (PROJECT_PLAN.md §5.1 A6).
 * Ten thousand of them make a millisecond; getting this constant wrong is the
 * classic way to end up with lip-sync that drifts by a factor of ten.
 */
export const TICKS_PER_MS = 10_000;

export function ticksToMs(ticks: number): number {
  return Math.round(ticks / TICKS_PER_MS);
}

/** Azure viseme 0 is silence — a timeline of only these articulates nothing. */
const SILENCE_VISEME_ID = 0;

/**
 * Enforces the SpeechPacket contract's guarantee that `visemes` is ordered
 * ascending by `timeMs`, and drops frames that say nothing new.
 *
 * The avatar's coarticulation engine derives each viseme's span from the gap to
 * the next onset, so a repeated id is not just redundant — dropping it lets the
 * articulation hold across its true duration instead of being re-attacked.
 */
export function normaliseVisemeTimeline(frames: readonly VisemeFrame[]): VisemeFrame[] {
  const sorted = [...frames]
    .map((frame) => ({ timeMs: Math.max(0, Math.round(frame.timeMs)), visemeId: frame.visemeId }))
    .sort((a, b) => a.timeMs - b.timeMs);

  // Some Azure locales (bn-IN, kn-IN, ml-IN as of 2026-08) accept the SSML and
  // return audio, but emit no real viseme events — just a lone silence frame.
  // Passed through, that is worse than nothing: the contract says an *empty*
  // timeline means "fall back to amplitude-driven jaw", so a one-frame timeline
  // slips past that check and freezes the mouth for the whole utterance.
  // Collapsing it to empty hands every consumer the documented fallback.
  if (!frames.some((frame) => frame.visemeId !== SILENCE_VISEME_ID)) return [];

  const result: VisemeFrame[] = [];
  for (const frame of sorted) {
    const previous = result[result.length - 1];
    if (previous && previous.visemeId === frame.visemeId) continue;
    if (previous && previous.timeMs === frame.timeMs) {
      // Two different visemes stamped at the same millisecond: the later one
      // wins, since it is what the audio actually goes on to articulate.
      result[result.length - 1] = frame;
      continue;
    }
    result.push(frame);
  }
  return result;
}

/** Tail of silence assumed after the last viseme when Azure reports no duration. */
const DURATION_FALLBACK_TAIL_MS = 250;

/**
 * Prefers the duration Azure measured; falls back to the timeline's own extent.
 * A zero here would make the avatar treat the packet as instantaneous.
 */
export function resolveDurationMs(
  audioDurationTicks: number | undefined,
  visemes: readonly VisemeFrame[],
): number {
  if (audioDurationTicks !== undefined && audioDurationTicks > 0) {
    return ticksToMs(audioDurationTicks);
  }
  const last = visemes[visemes.length - 1];
  return last ? last.timeMs + DURATION_FALLBACK_TAIL_MS : 0;
}
