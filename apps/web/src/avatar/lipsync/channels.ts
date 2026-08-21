/**
 * ARKit articulatory channels the lip-sync engine composes (AVATAR_DESIGN_SPEC.md §4.2).
 * These are primitives (jaw, pucker, roll, stretch…), not whole-mouth poses —
 * composition is what makes coarticulation possible.
 */
export const LIPSYNC_CHANNELS = [
  'jawOpen',
  'mouthClose',
  'mouthFunnel',
  'mouthPucker',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthShrugUpper',
  'mouthRollLower',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'tongueOut',
] as const;

export type LipsyncChannel = (typeof LIPSYNC_CHANNELS)[number];

/** A viseme recipe: a sparse set of ARKit channel weights. */
export type ArkitWeights = Partial<Record<LipsyncChannel, number>>;

export const CHANNEL_COUNT = LIPSYNC_CHANNELS.length;

export const CHANNEL_INDEX: Record<LipsyncChannel, number> = Object.fromEntries(
  LIPSYNC_CHANNELS.map((name, index) => [name, index]),
) as Record<LipsyncChannel, number>;

/**
 * Channels driven by secondary motion (§4.8) — deliberately outside the
 * coarticulation engine so speech never fights blinks or brows.
 */
export const SECONDARY_CHANNELS = ['browInnerUp', 'eyeBlinkLeft', 'eyeBlinkRight'] as const;

export type SecondaryChannel = (typeof SECONDARY_CHANNELS)[number];
