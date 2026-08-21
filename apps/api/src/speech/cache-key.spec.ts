import { describe, expect, it } from 'vitest';
import { fixtureKey, normaliseText, ttsCacheKey } from './cache-key';

describe('ttsCacheKey', () => {
  it('is stable for the same text, lang and voice', () => {
    expect(ttsCacheKey('Revenue rose 12%.', 'en-IN', 'en-IN-NeerjaNeural')).toBe(
      ttsCacheKey('Revenue rose 12%.', 'en-IN', 'en-IN-NeerjaNeural'),
    );
  });

  it('ignores insignificant whitespace, so tuning replays stay free', () => {
    expect(ttsCacheKey('  Revenue   rose 12%. ', 'en-IN', 'v')).toBe(
      ttsCacheKey('Revenue rose 12%.', 'en-IN', 'v'),
    );
  });

  it('separates on lang and on voice', () => {
    const base = ttsCacheKey('Hello', 'en-IN', 'en-IN-NeerjaNeural');
    expect(ttsCacheKey('Hello', 'hi-IN', 'en-IN-NeerjaNeural')).not.toBe(base);
    expect(ttsCacheKey('Hello', 'en-IN', 'en-IN-Other')).not.toBe(base);
  });

  it('does not let a field boundary shift produce a collision', () => {
    // A space separator would hash both of these as "a b en-IN v".
    expect(ttsCacheKey('a b', 'en-IN', 'v')).not.toBe(ttsCacheKey('a', 'b en-IN', 'v'));
  });

  it('is case-insensitive in lang and voice but not in text', () => {
    expect(ttsCacheKey('Hello', 'EN-in', 'Neerja')).toBe(ttsCacheKey('Hello', 'en-IN', 'neerja'));
    expect(ttsCacheKey('hello', 'en-IN', 'v')).not.toBe(ttsCacheKey('Hello', 'en-IN', 'v'));
  });
});

describe('normaliseText', () => {
  it('collapses runs of whitespace including newlines', () => {
    expect(normaliseText('one\n\ttwo   three ')).toBe('one two three');
  });
});

describe('fixtureKey', () => {
  it('matches regardless of case, so a fixture is found as typed', () => {
    expect(fixtureKey('Hi, I am Netra.', 'en-US')).toBe(fixtureKey('hi, i am netra.', 'en-us'));
  });

  it('still separates different languages', () => {
    expect(fixtureKey('Hello', 'en-US')).not.toBe(fixtureKey('Hello', 'hi-IN'));
  });
});
