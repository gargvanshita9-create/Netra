import type { ArkitWeights, LipsyncChannel } from './channels';

/**
 * Azure viseme ID → ARKit weight recipe (AVATAR_DESIGN_SPEC.md §4.2).
 * Starting values — tuned by eye during A3 via leva. Note the deliberate
 * asymmetries: FF tucks the lower lip with mouthRollLower, SS keeps the jaw
 * nearly shut with corners wide, U is mostly pucker with barely any jaw.
 */
export const VISEME_RECIPES: Record<number, ArkitWeights> = {
  0: { jawOpen: 0.02 }, // silence
  1: { jawOpen: 0.45, mouthStretchLeft: 0.12, mouthStretchRight: 0.12 }, // æ ə ʌ
  2: { jawOpen: 0.62, mouthStretchLeft: 0.08, mouthStretchRight: 0.08 }, // ɑ
  3: { jawOpen: 0.45, mouthPucker: 0.35, mouthFunnel: 0.42 }, // ɔ
  4: { jawOpen: 0.32, mouthStretchLeft: 0.28, mouthStretchRight: 0.28 }, // ɛ ʊ
  5: { jawOpen: 0.28, mouthPucker: 0.18, mouthFunnel: 0.15 }, // ɝ
  6: {
    jawOpen: 0.16,
    mouthSmileLeft: 0.3,
    mouthSmileRight: 0.3,
    mouthStretchLeft: 0.35,
    mouthStretchRight: 0.35,
  }, // i ɪ j
  7: { jawOpen: 0.14, mouthPucker: 0.72, mouthFunnel: 0.55 }, // u w
  8: { jawOpen: 0.4, mouthPucker: 0.42, mouthFunnel: 0.48 }, // o
  9: { jawOpen: 0.55, mouthPucker: 0.2 }, // aʊ
  10: { jawOpen: 0.42, mouthPucker: 0.3, mouthFunnel: 0.3 }, // ɔɪ
  11: { jawOpen: 0.52, mouthStretchLeft: 0.15, mouthStretchRight: 0.15 }, // aɪ
  12: { jawOpen: 0.2 }, // h
  13: { jawOpen: 0.14, mouthPucker: 0.3, mouthFunnel: 0.22 }, // ɹ
  14: { jawOpen: 0.14, tongueOut: 0.06, mouthShrugUpper: 0.12 }, // l
  15: {
    jawOpen: 0.05,
    mouthStretchLeft: 0.3,
    mouthStretchRight: 0.3,
    mouthDimpleLeft: 0.2,
    mouthDimpleRight: 0.2,
  }, // s z
  16: { jawOpen: 0.14, mouthPucker: 0.48, mouthFunnel: 0.4 }, // ʃ tʃ dʒ ʒ
  17: { jawOpen: 0.14, tongueOut: 0.22, mouthLowerDownLeft: 0.18, mouthLowerDownRight: 0.18 }, // ð θ
  18: {
    jawOpen: 0.08,
    mouthLowerDownLeft: 0.32,
    mouthLowerDownRight: 0.32,
    mouthRollLower: 0.3,
    mouthFunnel: 0.15,
  }, // f v
  19: { jawOpen: 0.12, mouthShrugUpper: 0.22, tongueOut: 0.04 }, // d t n
  20: { jawOpen: 0.22, mouthPressLeft: 0.1, mouthPressRight: 0.1 }, // k g ŋ
  21: {
    jawOpen: 0.0,
    mouthClose: 1.0,
    mouthPressLeft: 0.45,
    mouthPressRight: 0.45,
    mouthRollLower: 0.15,
  }, // p b m
};

/** Highest Azure viseme ID + 1. */
export const VISEME_COUNT = 22;

/** Bilabial closure viseme — p, b, m (§4.5). */
export const BILABIAL_VISEME_ID = 21;

/** Labiodental viseme — f, v (§4.5, weaker enforcement). */
export const LABIODENTAL_VISEME_ID = 18;

export type PhonemeClass = 'silence' | 'plosive' | 'fricative' | 'nasal' | 'vowel';

/**
 * Azure viseme ID → phoneme class, driving coarticulation spread (σ) and
 * attack/decay speed (§4.4, §4.6). Liquids group with nasals per the τ table.
 */
export const VISEME_CLASS: Record<number, PhonemeClass> = {
  0: 'silence',
  1: 'vowel',
  2: 'vowel',
  3: 'vowel',
  4: 'vowel',
  5: 'vowel',
  6: 'vowel',
  7: 'vowel',
  8: 'vowel',
  9: 'vowel',
  10: 'vowel',
  11: 'vowel',
  12: 'fricative', // h
  13: 'nasal', // ɹ (liquid)
  14: 'nasal', // l (liquid)
  15: 'fricative',
  16: 'fricative',
  17: 'fricative',
  18: 'fricative',
  19: 'plosive',
  20: 'plosive',
  21: 'plosive',
};

/** Coarticulation gaussian width per class, ms (§4.4). Vowels bleed; plosives don't. */
export const DEFAULT_SIGMA_MS: Record<PhonemeClass, number> = {
  silence: 70,
  plosive: 25,
  fricative: 40,
  nasal: 40,
  vowel: 70,
};

/** Attack τ per class, ms (§4.6). */
export const DEFAULT_ATTACK_MS: Record<PhonemeClass, number> = {
  silence: 80,
  plosive: 25,
  fricative: 45,
  nasal: 55,
  vowel: 80,
};

/** Release τ per class, ms (§4.6). */
export const DEFAULT_RELEASE_MS: Record<PhonemeClass, number> = {
  silence: 140,
  plosive: 40,
  fricative: 55,
  nasal: 65,
  vowel: 100,
};

/**
 * Per-channel dominance groups (§4.4) — how strongly an articulator resists
 * being overridden by neighbouring visemes.
 */
export interface DominanceGroups {
  /** mouthClose, mouthPress* — bilabials must win. */
  bilabial: number;
  /** mouthPucker, mouthFunnel — rounding spreads to neighbours. */
  rounding: number;
  /** jawOpen — slow, heavily smoothed by adjacent sounds. */
  jaw: number;
  /** mouthStretch*, mouthSmile* — spreading is easily overridden. */
  spreading: number;
  /** tongueOut — tongue position is not negotiable when required. */
  tongue: number;
  /** Everything else — unspecified by the table. */
  other: number;
}

export const DEFAULT_DOMINANCE: DominanceGroups = {
  bilabial: 1.0,
  rounding: 0.8,
  jaw: 0.6,
  spreading: 0.5,
  tongue: 0.9,
  other: 0.6,
};

/**
 * How strongly a viseme that does NOT use a channel pulls it back toward zero.
 * The default is derived from dominance (`max(floor, 1 − dominance)`), which is
 * right for articulators that legitimately bleed across neighbours.
 *
 * `tongueOut` is the exception: dominance 0.9 means "wins when required", but
 * the derived restore of 0.1 leaves the tongue hanging out for the rest of the
 * window. A protruding tongue is binary and unmistakable — it must snap back
 * the instant no viseme calls for it.
 */
export const CHANNEL_RESTORE_OVERRIDE: Partial<Record<LipsyncChannel, number>> = {
  tongueOut: 1.0,
};

export const CHANNEL_DOMINANCE_GROUP: Record<LipsyncChannel, keyof DominanceGroups> = {
  jawOpen: 'jaw',
  mouthClose: 'bilabial',
  mouthPressLeft: 'bilabial',
  mouthPressRight: 'bilabial',
  mouthPucker: 'rounding',
  mouthFunnel: 'rounding',
  mouthSmileLeft: 'spreading',
  mouthSmileRight: 'spreading',
  mouthStretchLeft: 'spreading',
  mouthStretchRight: 'spreading',
  mouthShrugUpper: 'other',
  mouthRollLower: 'other',
  mouthLowerDownLeft: 'other',
  mouthLowerDownRight: 'other',
  mouthDimpleLeft: 'other',
  mouthDimpleRight: 'other',
  tongueOut: 'tongue',
};
