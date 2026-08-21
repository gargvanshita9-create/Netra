const DEG = Math.PI / 180;

/** Tunable amplitudes for step ⑦ (§4.8), exposed via leva. */
export interface SecondaryTuning {
  /** browInnerUp tracks the RMS envelope at this amplitude. */
  browGain: number;
  /** Head pitch nod on amplitude peaks, degrees. */
  nodDegrees: number;
  /** Slow head yaw drift amplitude, degrees. */
  yawDriftDegrees: number;
  /** Gaze micro-saccade range, degrees. */
  saccadeDegrees: number;
}

export function defaultSecondaryTuning(): SecondaryTuning {
  return { browGain: 0.15, nodDegrees: 2, yawDriftDegrees: 3, saccadeDegrees: 3 };
}

const BLINK_DURATION_S = 0.18;
const BLINK_MIN_INTERVAL_S = 2;
const BLINK_MAX_INTERVAL_S = 6;
const SACCADE_MIN_INTERVAL_S = 0.8;
const SACCADE_MAX_INTERVAL_S = 2;

/**
 * Secondary motion (§4.8): brow, blink, head nod/drift, gaze micro-saccades.
 * Perfect lips on a motionless head still look dead — this runs continuously,
 * speaking or not. Outputs are read each frame and applied to morphs (brow,
 * blink) and bones (head, eyes) by the lip-sync hook.
 */
export class SecondaryMotion {
  readonly tuning: SecondaryTuning = defaultSecondaryTuning();

  browInnerUp = 0;
  eyeBlink = 0;
  headPitchRad = 0;
  headYawRad = 0;
  eyeYawRad = 0;
  eyePitchRad = 0;

  /** 0–1 while a blink is in flight; ≥1 when idle. */
  private blinkPhase = 1;
  private nextBlinkInS = 1.5 + Math.random() * 2;
  private nextSaccadeInS = 1;
  private gazeYawTarget = 0;
  private gazePitchTarget = 0;
  private smoothedBrow = 0;
  private smoothedNod = 0;
  private wasSpeaking = false;

  update(dtSeconds: number, elapsedSeconds: number, normalisedRms: number, speaking: boolean): void {
    const { tuning } = this;

    // Blink: randomised 2–6s cadence, plus a near-guaranteed blink at speech
    // boundaries (real speakers blink at clause breaks).
    this.nextBlinkInS -= dtSeconds;
    const speechJustEnded = this.wasSpeaking && !speaking;
    if (this.blinkPhase >= 1 && (this.nextBlinkInS <= 0 || speechJustEnded)) {
      this.blinkPhase = 0;
      this.nextBlinkInS =
        BLINK_MIN_INTERVAL_S + Math.random() * (BLINK_MAX_INTERVAL_S - BLINK_MIN_INTERVAL_S);
    }
    if (this.blinkPhase < 1) {
      this.blinkPhase = Math.min(1, this.blinkPhase + dtSeconds / BLINK_DURATION_S);
      const phase = this.blinkPhase;
      // Fast close, slower open.
      this.eyeBlink = phase < 0.35 ? phase / 0.35 : 1 - (phase - 0.35) / 0.65;
    } else {
      this.eyeBlink = 0;
    }

    // Brow follows the loudness envelope while speaking, relaxes otherwise.
    const browTarget = speaking ? tuning.browGain * normalisedRms : 0.02;
    this.smoothedBrow += (browTarget - this.smoothedBrow) * (1 - Math.exp(-dtSeconds / 0.15));
    this.browInnerUp = this.smoothedBrow;

    // Head: small pitch nod on amplitude peaks, slow yaw drift (~0.2 Hz).
    const nodTarget = speaking ? normalisedRms * tuning.nodDegrees * DEG : 0;
    this.smoothedNod += (nodTarget - this.smoothedNod) * (1 - Math.exp(-dtSeconds / 0.12));
    this.headPitchRad = this.smoothedNod + 0.4 * DEG * Math.sin(elapsedSeconds * 0.23);
    this.headYawRad =
      tuning.yawDriftDegrees *
      DEG *
      (0.6 * Math.sin(elapsedSeconds * 1.26) + 0.4 * Math.sin(elapsedSeconds * 0.44 + 1.7));

    // Gaze: micro-saccades every 0.8–2s within a few degrees, fast settle.
    this.nextSaccadeInS -= dtSeconds;
    if (this.nextSaccadeInS <= 0) {
      this.nextSaccadeInS =
        SACCADE_MIN_INTERVAL_S + Math.random() * (SACCADE_MAX_INTERVAL_S - SACCADE_MIN_INTERVAL_S);
      const range = tuning.saccadeDegrees * DEG;
      this.gazeYawTarget = (Math.random() * 2 - 1) * range;
      this.gazePitchTarget = (Math.random() * 2 - 1) * range * 0.5;
    }
    const saccadeBlend = 1 - Math.exp(-dtSeconds / 0.04);
    this.eyeYawRad += (this.gazeYawTarget - this.eyeYawRad) * saccadeBlend;
    this.eyePitchRad += (this.gazePitchTarget - this.eyePitchRad) * saccadeBlend;

    this.wasSpeaking = speaking;
  }
}
