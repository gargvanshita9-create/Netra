import { createHash } from 'node:crypto';

/**
 * Field separator. NUL, not a space: normalised text contains spaces, so a
 * space separator would let ("a b", "c") collide with ("a", "b c").
 */
const SEP = '\u0000';

/**
 * Collapses insignificant whitespace so "Hello  world\n" and "Hello world"
 * are one cache entry rather than two paid syntheses.
 */
export function normaliseText(text: string): string {
  return text.trim().replace(/\s+/gu, ' ');
}

/**
 * The TTS cache key required by CLAUDE.md's cost discipline: hash(text + lang + voice).
 *
 * Tuning lip-sync means replaying one sentence hundreds of times; every replay
 * after the first must be free. The NUL separators keep ("ab", "c") from
 * colliding with ("a", "bc").
 */
export function ttsCacheKey(text: string, lang: string, voice: string): string {
  return createHash('sha256')
    .update(`${normaliseText(text)}${SEP}${lang.toLowerCase()}${SEP}${voice.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Fixture lookup key. Deliberately voice-agnostic: a fixture is the canned
 * recording of a sentence in a language, and the hand-authored ones predate
 * any Azure voice being chosen (ADR-008).
 */
export function fixtureKey(text: string, lang: string): string {
  return `${normaliseText(text).toLowerCase()}${SEP}${lang.toLowerCase()}`;
}

/** "en-IN" → "en". The regional subtag, dropped. */
export function primaryLanguage(lang: string): string {
  const separator = lang.indexOf('-');
  return (separator === -1 ? lang : lang.slice(0, separator)).toLowerCase();
}

/**
 * Looser fixture key that ignores the region: an `en-IN` request should be able
 * to reach an `en-US` recording rather than dead-end, since the alternative is
 * a fixture store that answers only the exact regional tag it was authored with.
 */
export function fixtureLanguageKey(text: string, lang: string): string {
  return `${normaliseText(text).toLowerCase()}${SEP}${primaryLanguage(lang)}`;
}
