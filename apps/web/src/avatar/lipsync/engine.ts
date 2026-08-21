import type { VisemeFrame } from '@netra/contracts';
import { CHANNEL_COUNT, CHANNEL_INDEX, LIPSYNC_CHANNELS } from './channels';
import {
  BILABIAL_VISEME_ID,
  CHANNEL_DOMINANCE_GROUP,
  CHANNEL_RESTORE_OVERRIDE,
  DEFAULT_ATTACK_MS,
  DEFAULT_DOMINANCE,
  DEFAULT_RELEASE_MS,
  DEFAULT_SIGMA_MS,
  LABIODENTAL_VISEME_ID,
  VISEME_CLASS,
  VISEME_COUNT,
  VISEME_RECIPES,
  type DominanceGroups,
  type PhonemeClass,
} from './recipes';

/** Every constant the tuning workflow (§4.11) needs to reach, exposed via leva. */
export interface LipsyncTuning {
  /** Visual lead over audio, ms (§4.3). */
  leadMs: number;
  /** Coarticulation half-window, ms (§4.4). */
  windowMs: number;
  /**
   * How strongly a viseme that does NOT use a channel pulls it toward zero:
   * max(floor, 1 − dominance). Keeps dominance-1.0 channels from smearing
   * across the whole window while still letting bilabials win near centre.
   */
  dominanceFloor: number;
  dominance: DominanceGroups;
  sigmaMs: Record<PhonemeClass, number>;
  attackMs: Record<PhonemeClass, number>;
  releaseMs: Record<PhonemeClass, number>;
  /** Return-to-silence release τ, ms (§4.6). */
  silenceReleaseMs: number;
  /**
   * §4.5 enforcement targets, at the spec's values. Assets whose blendshapes
   * reach lip contact below 1.0 are handled by `channelGain`, not by weakening
   * the enforcement itself.
   */
  bilabialMouthClose: number;
  bilabialJawOpenMax: number;
  labiodentalRollLower: number;
  /** jawOpen *= jawRmsBase + jawRmsGain · normalisedRms (§4.7). */
  jawRmsBase: number;
  jawRmsGain: number;
  /** Mild version of the same for mouthStretch* (§4.7). */
  stretchRmsBase: number;
  stretchRmsGain: number;
}

export function defaultTuning(): LipsyncTuning {
  return {
    leadMs: 40,
    windowMs: 120,
    dominanceFloor: 0.15,
    dominance: { ...DEFAULT_DOMINANCE },
    sigmaMs: { ...DEFAULT_SIGMA_MS },
    attackMs: { ...DEFAULT_ATTACK_MS },
    releaseMs: { ...DEFAULT_RELEASE_MS },
    silenceReleaseMs: 140,
    bilabialMouthClose: 0.9,
    bilabialJawOpenMax: 0.03,
    labiodentalRollLower: 0.25,
    jawRmsBase: 0.55,
    jawRmsGain: 0.75,
    stretchRmsBase: 0.85,
    stretchRmsGain: 0.3,
  };
}

// Recipes and classes compiled to flat arrays once — the per-frame loop never
// touches objects or allocates (CLAUDE.md performance budget).
const RECIPE_VALUE = new Float32Array(VISEME_COUNT * CHANNEL_COUNT);
const RECIPE_SPECIFIED = new Uint8Array(VISEME_COUNT * CHANNEL_COUNT);
const VISEME_CLASS_BY_ID: PhonemeClass[] = [];

for (let visemeId = 0; visemeId < VISEME_COUNT; visemeId++) {
  VISEME_CLASS_BY_ID.push(VISEME_CLASS[visemeId] ?? 'silence');
  const recipe = VISEME_RECIPES[visemeId];
  if (!recipe) continue;
  for (const channel of LIPSYNC_CHANNELS) {
    const value = recipe[channel];
    if (value === undefined) continue;
    RECIPE_VALUE[visemeId * CHANNEL_COUNT + CHANNEL_INDEX[channel]] = value;
    RECIPE_SPECIFIED[visemeId * CHANNEL_COUNT + CHANNEL_INDEX[channel]] = 1;
  }
}

const JAW_OPEN = CHANNEL_INDEX.jawOpen;
const MOUTH_CLOSE = CHANNEL_INDEX.mouthClose;
const MOUTH_ROLL_LOWER = CHANNEL_INDEX.mouthRollLower;
const MOUTH_STRETCH_LEFT = CHANNEL_INDEX.mouthStretchLeft;
const MOUTH_STRETCH_RIGHT = CHANNEL_INDEX.mouthStretchRight;

const SILENCE_JAW_OPEN = 0.02; // §4.8 — lips never fully sealed at rest
/** How many timeline entries around the cursor the window scan may span. */
const SCAN_RADIUS = 12;
/** Fallback duration for the final viseme when durationMs doesn't cover it. */
const FALLBACK_DURATION_MS = 80;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The lip-sync engine (AVATAR_DESIGN_SPEC.md §4.1 pipeline, steps ①–⑥).
 * Pure and render-agnostic: feed it a viseme timeline, then call `update`
 * once per frame; read composed ARKit weights from `output`, indexed by
 * `CHANNEL_INDEX`. Secondary motion (step ⑦) lives in `secondary-motion.ts`.
 */
export class LipsyncEngine {
  readonly tuning: LipsyncTuning = defaultTuning();

  /** Final per-channel weights for this frame (post amplitude + enforcement). */
  readonly output = new Float32Array(CHANNEL_COUNT);

  /**
   * Per-asset output calibration. An ARKit weight of 1.0 deforms different
   * models by different amounts, so the recipes and §4.5 enforcement stay
   * spec-faithful and the asset's own scaling lives here. Defaults to 1.
   */
  readonly channelGain = new Float32Array(CHANNEL_COUNT).fill(1);

  /** Smoothed articulation state (pre amplitude), kept across frames. */
  private readonly smoothed = new Float32Array(CHANNEL_COUNT);
  /** Coarticulated targets for the current frame. */
  private readonly targets = new Float32Array(CHANNEL_COUNT);
  private readonly numerator = new Float32Array(CHANNEL_COUNT);
  private readonly denominator = new Float32Array(CHANNEL_COUNT);
  /** Per-channel dominance resolved from the group table. */
  private readonly channelDominance = new Float32Array(CHANNEL_COUNT);
  /** Per-channel pull toward zero from visemes that do not specify it. */
  private readonly channelRestore = new Float32Array(CHANNEL_COUNT);

  // Timeline, flattened for the scan loop.
  private startMs = new Float32Array(0);
  private durationMs = new Float32Array(0);
  private visemeIds = new Int32Array(0);
  private frameCount = 0;
  private cursor = 0;

  private governingClass: PhonemeClass = 'silence';
  private hasSpeech = false;
  private bilabialLock = false;
  private labiodentalLock = false;

  constructor() {
    this.refreshDominance();
  }

  /** Re-resolve per-channel dominance after `tuning.dominance` changes. */
  refreshDominance(): void {
    for (let c = 0; c < CHANNEL_COUNT; c++) {
      const channel = LIPSYNC_CHANNELS[c];
      if (!channel) continue;
      const dominance = this.tuning.dominance[CHANNEL_DOMINANCE_GROUP[channel]];
      this.channelDominance[c] = dominance;
      this.channelRestore[c] =
        CHANNEL_RESTORE_OVERRIDE[channel] ?? Math.max(this.tuning.dominanceFloor, 1 - dominance);
    }
  }

  /** Load a packet's viseme timeline. Frames must be ascending by timeMs. */
  setTimeline(frames: readonly VisemeFrame[], totalDurationMs: number): void {
    this.frameCount = frames.length;
    this.cursor = 0;
    if (frames.length > this.startMs.length) {
      this.startMs = new Float32Array(frames.length);
      this.durationMs = new Float32Array(frames.length);
      this.visemeIds = new Int32Array(frames.length);
    }
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const next = frames[i + 1];
      if (!frame) continue;
      const end = next ? next.timeMs : Math.max(totalDurationMs, frame.timeMs + FALLBACK_DURATION_MS);
      this.startMs[i] = frame.timeMs;
      this.durationMs[i] = Math.max(1, end - frame.timeMs);
      this.visemeIds[i] = frame.visemeId;
    }
  }

  /**
   * Advance one frame.
   * @param audioTimeMs current audio playhead, or null when not speaking
   * @param dtMs frame delta in ms
   * @param normalisedRms 0–1 loudness envelope (§4.7)
   */
  update(audioTimeMs: number | null, dtMs: number, normalisedRms: number): void {
    this.computeTargets(audioTimeMs === null ? null : audioTimeMs + this.tuning.leadMs);
    this.smoothTowardTargets(dtMs);
    this.composeOutput(normalisedRms);
  }

  /** ① recipes + ③ coarticulation + ④ enforcement, into `targets`. */
  private computeTargets(timeMs: number | null): void {
    const { targets, numerator, denominator, tuning } = this;
    targets.fill(0);
    this.hasSpeech = false;
    this.bilabialLock = false;
    this.labiodentalLock = false;
    this.governingClass = 'silence';

    if (timeMs === null || this.frameCount === 0) {
      targets[JAW_OPEN] = SILENCE_JAW_OPEN;
      return;
    }

    // Track the active viseme with a persistent cursor (rewinds on seek-back).
    let cursor = Math.min(this.cursor, this.frameCount - 1);
    while (cursor > 0 && (this.startMs[cursor] ?? 0) > timeMs) cursor--;
    while (cursor + 1 < this.frameCount && (this.startMs[cursor + 1] ?? Infinity) <= timeMs) cursor++;
    this.cursor = cursor;

    numerator.fill(0);
    denominator.fill(0);
    let bestGaussian = 0;

    const lo = Math.max(0, cursor - SCAN_RADIUS);
    const hi = Math.min(this.frameCount - 1, cursor + SCAN_RADIUS);
    for (let i = lo; i <= hi; i++) {
      const start = this.startMs[i] ?? 0;
      const duration = this.durationMs[i] ?? 1;
      const visemeId = this.visemeIds[i] ?? 0;

      // Distance measured from the viseme's span, not its onset, so long
      // holds (e.g. Hindi long vowels, §4.9) keep full influence throughout.
      const distance = timeMs < start ? start - timeMs : Math.max(0, timeMs - (start + duration));
      if (distance > tuning.windowMs) continue;

      const phonemeClass = VISEME_CLASS_BY_ID[visemeId] ?? 'silence';
      const sigma = tuning.sigmaMs[phonemeClass];
      const gaussian = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      this.hasSpeech = true;
      if (gaussian > bestGaussian) {
        bestGaussian = gaussian;
        this.governingClass = phonemeClass;
      }

      const rowOffset = visemeId * CHANNEL_COUNT;
      for (let c = 0; c < CHANNEL_COUNT; c++) {
        // Specifying visemes push toward their recipe value with full
        // dominance; non-specifying neighbours pull toward zero with the
        // channel's restore strength, so nothing smears indefinitely.
        const pull =
          (RECIPE_SPECIFIED[rowOffset + c] ?? 0) === 1
            ? (this.channelDominance[c] ?? 0.5)
            : (this.channelRestore[c] ?? 0.5);
        const weighted = pull * gaussian;
        numerator[c] = (numerator[c] ?? 0) + (RECIPE_VALUE[rowOffset + c] ?? 0) * weighted;
        denominator[c] = (denominator[c] ?? 0) + weighted;
      }

      // ④ closure enforcement windows (§4.5), applied to targets below and
      // re-clamped after smoothing in composeOutput.
      const phase = (timeMs - start) / duration;
      if (visemeId === BILABIAL_VISEME_ID && phase >= 0.2 && phase <= 0.8) {
        this.bilabialLock = true;
      }
      if (visemeId === LABIODENTAL_VISEME_ID && phase >= 0.3 && phase <= 0.7) {
        this.labiodentalLock = true;
      }
    }

    if (!this.hasSpeech) {
      targets[JAW_OPEN] = SILENCE_JAW_OPEN;
      return;
    }

    for (let c = 0; c < CHANNEL_COUNT; c++) {
      const den = denominator[c] ?? 0;
      targets[c] = den > 1e-4 ? (numerator[c] ?? 0) / den : 0;
    }

    if (this.bilabialLock) {
      targets[MOUTH_CLOSE] = Math.max(targets[MOUTH_CLOSE] ?? 0, tuning.bilabialMouthClose);
      targets[JAW_OPEN] = Math.min(targets[JAW_OPEN] ?? 0, tuning.bilabialJawOpenMax);
    }
    if (this.labiodentalLock) {
      targets[MOUTH_ROLL_LOWER] = Math.max(
        targets[MOUTH_ROLL_LOWER] ?? 0,
        tuning.labiodentalRollLower,
      );
    }
  }

  /** ⑤ class-specific, frame-rate-independent attack/decay (§4.6). */
  private smoothTowardTargets(dtMs: number): void {
    const { smoothed, targets, tuning } = this;
    const attackTau = tuning.attackMs[this.governingClass];
    const releaseTau = tuning.releaseMs[this.governingClass];
    for (let c = 0; c < CHANNEL_COUNT; c++) {
      const current = smoothed[c] ?? 0;
      const target = targets[c] ?? 0;
      const tau = !this.hasSpeech
        ? tuning.silenceReleaseMs
        : target > current
          ? attackTau
          : releaseTau;
      smoothed[c] = current + (target - current) * (1 - Math.exp(-dtMs / tau));
    }
  }

  /** ⑥ amplitude modulation (§4.7) + final closure guarantees, into `output`. */
  private composeOutput(normalisedRms: number): void {
    const { output, smoothed, tuning } = this;
    output.set(smoothed);

    // Never modulate mouthClose — a quiet "m" is still fully closed.
    const jawScale = tuning.jawRmsBase + tuning.jawRmsGain * normalisedRms;
    const stretchScale = tuning.stretchRmsBase + tuning.stretchRmsGain * normalisedRms;
    output[JAW_OPEN] = clamp01((output[JAW_OPEN] ?? 0) * (this.hasSpeech ? jawScale : 1));
    if (this.hasSpeech) {
      output[MOUTH_STRETCH_LEFT] = clamp01((output[MOUTH_STRETCH_LEFT] ?? 0) * stretchScale);
      output[MOUTH_STRETCH_RIGHT] = clamp01((output[MOUTH_STRETCH_RIGHT] ?? 0) * stretchScale);
    }

    // The pause test (§4.10.1) is binary: bilabial frames must be sealed.
    if (this.bilabialLock) {
      output[MOUTH_CLOSE] = Math.max(output[MOUTH_CLOSE] ?? 0, tuning.bilabialMouthClose);
      output[JAW_OPEN] = Math.min(output[JAW_OPEN] ?? 0, tuning.bilabialJawOpenMax);
    }
    if (this.labiodentalLock) {
      output[MOUTH_ROLL_LOWER] = Math.max(
        output[MOUTH_ROLL_LOWER] ?? 0,
        tuning.labiodentalRollLower,
      );
    }

    // Asset calibration last, so the spec-level logic above never has to know
    // which model it is driving.
    for (let c = 0; c < CHANNEL_COUNT; c++) {
      output[c] = clamp01((output[c] ?? 0) * (this.channelGain[c] ?? 1));
    }
  }
}
