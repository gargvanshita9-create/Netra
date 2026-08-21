import { describe, expect, it } from 'vitest';
import { TICKS_PER_MS, normaliseVisemeTimeline, resolveDurationMs, ticksToMs } from './viseme-timeline';

describe('ticksToMs', () => {
  it('converts Azure 100-nanosecond ticks to milliseconds', () => {
    expect(TICKS_PER_MS).toBe(10_000);
    expect(ticksToMs(10_000)).toBe(1);
    expect(ticksToMs(46_500_000)).toBe(4650);
    expect(ticksToMs(0)).toBe(0);
  });

  it('rounds rather than truncating, so timings do not drift early', () => {
    expect(ticksToMs(15_000)).toBe(2);
  });
});

describe('normaliseVisemeTimeline', () => {
  it('sorts ascending by timeMs, as the SpeechPacket contract requires', () => {
    const result = normaliseVisemeTimeline([
      { timeMs: 300, visemeId: 6 },
      { timeMs: 100, visemeId: 21 },
      { timeMs: 200, visemeId: 1 },
    ]);
    expect(result.map((frame) => frame.timeMs)).toEqual([100, 200, 300]);
  });

  it('drops a repeated viseme so its articulation holds instead of re-attacking', () => {
    const result = normaliseVisemeTimeline([
      { timeMs: 0, visemeId: 7 },
      { timeMs: 80, visemeId: 7 },
      { timeMs: 160, visemeId: 2 },
    ]);
    expect(result).toEqual([
      { timeMs: 0, visemeId: 7 },
      { timeMs: 160, visemeId: 2 },
    ]);
  });

  it('keeps the later viseme when two land on the same millisecond', () => {
    const result = normaliseVisemeTimeline([
      { timeMs: 50, visemeId: 21 },
      { timeMs: 50, visemeId: 1 },
    ]);
    expect(result).toEqual([{ timeMs: 50, visemeId: 1 }]);
  });

  it('clamps negative offsets to zero', () => {
    // Uses a real viseme, not silence: a silence-only timeline is collapsed to
    // empty by the rule below, which would hide whether clamping happened.
    expect(normaliseVisemeTimeline([{ timeMs: -5, visemeId: 21 }])).toEqual([
      { timeMs: 0, visemeId: 21 },
    ]);
  });

  it('returns an empty timeline unchanged — the amplitude-fallback case', () => {
    expect(normaliseVisemeTimeline([])).toEqual([]);
  });

  it('collapses a silence-only timeline to empty so the fallback engages', () => {
    // What bn-IN, kn-IN and ml-IN actually return: audio, and one silence frame.
    // Left at length 1 it never trips the avatar's `length === 0` fallback check,
    // and the mouth stays frozen for the whole utterance.
    expect(normaliseVisemeTimeline([{ timeMs: 50, visemeId: 0 }])).toEqual([]);
    expect(
      normaliseVisemeTimeline([
        { timeMs: 0, visemeId: 0 },
        { timeMs: 900, visemeId: 0 },
      ]),
    ).toEqual([]);
  });

  it('keeps a timeline that has any real articulation in it', () => {
    expect(
      normaliseVisemeTimeline([
        { timeMs: 0, visemeId: 0 },
        { timeMs: 80, visemeId: 21 },
      ]),
    ).toHaveLength(2);
  });
});

describe('resolveDurationMs', () => {
  it('prefers the duration Azure measured', () => {
    expect(resolveDurationMs(46_500_000, [{ timeMs: 100, visemeId: 1 }])).toBe(4650);
  });

  it('falls back to the timeline extent plus a tail when Azure reports nothing', () => {
    expect(resolveDurationMs(undefined, [{ timeMs: 1000, visemeId: 1 }])).toBe(1250);
    expect(resolveDurationMs(0, [{ timeMs: 1000, visemeId: 1 }])).toBe(1250);
  });

  it('is zero only when there is genuinely nothing to go on', () => {
    expect(resolveDurationMs(undefined, [])).toBe(0);
  });
});
