import type { GestureId, Emotion } from './gesture.js';

/** Azure Speech viseme ID, 0–21. 0 = silence. */
export type VisemeId = number;

export interface VisemeFrame {
  /** Milliseconds from the start of the audio. */
  timeMs: number;
  visemeId: VisemeId;
}

export interface SpeechPacket {
  /** Stable id for caching and replay. */
  id: string;
  /** The spoken text — also rendered as captions. */
  text: string;
  /** BCP-47 tag, e.g. "en-IN", "hi-IN", "ta-IN". */
  lang: string;
  /** Base64 audio (fixtures, short replies) or a URL (streamed/cached). Exactly one. */
  audioBase64?: string;
  audioUrl?: string;
  /** MIME type of the audio, e.g. "audio/mpeg". */
  audioMimeType: string;
  /** Total audio duration in ms. */
  durationMs: number;
  /** Ordered, ascending by timeMs. Empty array ⇒ avatar falls back to amplitude-driven jaw. */
  visemes: VisemeFrame[];
  /** Body animation to play while speaking. */
  gesture: GestureId;
  /** Drives subtle facial expression offsets. */
  emotion: Emotion;
}
