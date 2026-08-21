/**
 * Smoothed, normalised loudness envelope from an HTMLAudioElement (§4.7).
 * Drives jaw amplitude modulation and secondary motion. A shouted vowel and a
 * whispered vowel share a viseme but not a jaw opening.
 */
export class RmsEnvelope {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private smoothedRms = 0;
  /** Running peak used to normalise; floored so near-silence never maps to 1. */
  private peak = RMS_PEAK_FLOOR;

  /**
   * Route the element through an AnalyserNode. Idempotent; call from a user
   * gesture (the play handler) so the AudioContext is allowed to start.
   * After this, the element's audio plays through the context.
   */
  attach(audio: HTMLAudioElement): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const context = new AudioContext();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyser.connect(context.destination);
    this.context = context;
    this.analyser = analyser;
    this.samples = new Float32Array(analyser.fftSize);
    void context.resume();
  }

  /** Advance one frame; returns the normalised envelope in [0, 1]. */
  update(dtSeconds: number): number {
    const { analyser, samples } = this;
    if (!analyser || !samples) return 0;

    analyser.getFloatTimeDomainData(samples);
    let sumOfSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i] ?? 0;
      sumOfSquares += sample * sample;
    }
    const rms = Math.sqrt(sumOfSquares / samples.length);

    // Fast attack, slower release — the jaw should open on a syllable's onset
    // but not flutter shut in the gaps between words.
    const tau = rms > this.smoothedRms ? 0.03 : 0.09;
    this.smoothedRms += (rms - this.smoothedRms) * (1 - Math.exp(-dtSeconds / tau));

    // Peak tracker decays slowly so normalisation adapts to the voice level.
    this.peak = Math.max(this.peak * Math.exp(-dtSeconds / 3), this.smoothedRms, RMS_PEAK_FLOOR);
    return Math.min(1, this.smoothedRms / this.peak);
  }

  dispose(): void {
    if (this.context) void this.context.close();
    this.context = null;
    this.analyser = null;
    this.samples = null;
  }
}

const RMS_PEAK_FLOOR = 0.05;
