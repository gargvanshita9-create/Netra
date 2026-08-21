import type { Emotion, GestureId, SpeechPacket } from '@netra/contracts';
import { config } from './config';

export interface SynthesizeOptions {
  /** The sentence the avatar will speak. */
  text: string;
  /** BCP-47 tag, e.g. "en-IN", "hi-IN", "ta-IN". */
  lang: string;
  /** Azure voice name. Omitted ⇒ the API's registered default for `lang`. */
  voice?: string;
  gesture?: GestureId;
  emotion?: Emotion;
}

interface ApiErrorBody {
  message?: string;
  issues?: { field: string; problem: string }[];
}

/**
 * The API states plainly what went wrong and what to do next; this preserves
 * that rather than replacing it with a status code. Field-level validation
 * issues are folded in so the caller can render one readable line.
 */
async function readError(response: Response): Promise<string> {
  let body: ApiErrorBody;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    return `Netra could not reach the speech service (HTTP ${response.status}). Check the API is running.`;
  }
  const issues = body.issues?.map((issue) => `${issue.field}: ${issue.problem}`).join('; ');
  return [body.message, issues].filter(Boolean).join(' — ') || `HTTP ${response.status}`;
}

/**
 * Asks the API to speak a sentence and returns the `SpeechPacket` to hand to
 * the avatar.
 *
 * The packet may have come from Azure, from the synthesis cache, or from a
 * hand-authored fixture — the caller cannot tell, and that indistinguishability
 * is the point of the frozen contract (PROJECT_PLAN.md §6).
 */
export async function synthesizeSpeech(options: SynthesizeOptions): Promise<SpeechPacket> {
  const response = await fetch(`${config.apiBaseUrl}/speech/synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as SpeechPacket;
}

export interface SpeechUsage {
  date: string;
  characters: number;
  requests: number;
  estimatedUsd: number;
  billable: boolean;
}

/** Today's Azure Speech spend, for a dev-only readout. */
export async function fetchSpeechUsage(): Promise<SpeechUsage> {
  const response = await fetch(`${config.apiBaseUrl}/speech/usage`);
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as SpeechUsage;
}
