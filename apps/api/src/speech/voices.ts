/**
 * Default Azure neural voice per language.
 *
 * All female, to match the character brief (AVATAR_DESIGN_SPEC-2 §1.1). An
 * unrecognised language is a 400 asking for an explicit `voice` rather than a
 * guess — a wrong voice name fails deep inside the Azure SDK with a message
 * that reads like a network error.
 *
 * These names are not verified against a live account (no AZURE_SPEECH_KEY is
 * configured yet). Confirm against the region's own voice list before relying
 * on one:
 *   curl -H "Ocp-Apim-Subscription-Key: $AZURE_SPEECH_KEY" \
 *     https://$AZURE_SPEECH_REGION.tts.speech.microsoft.com/cognitiveservices/voices/list
 */
/*
 * Viseme support is per-locale, and is NOT universal — measured against a live
 * centralindia resource on 2026-08-21:
 *
 *   emits visemes: en-IN, en-US, en-GB, hi-IN, ta-IN, mr-IN, te-IN, gu-IN
 *   audio only:    bn-IN (both voices), kn-IN, ml-IN
 *
 * The audio-only locales are still usable — the packet ships an empty viseme
 * timeline and the avatar falls back to amplitude-driven jaw motion — but the
 * lip-sync is visibly coarser. Deliberately not encoded as a lookup table:
 * Azure adds viseme support over time, and a hardcoded list would silently go
 * stale, whereas `AzureTtsService` warns whenever a response carries none.
 */
const DEFAULT_VOICE_BY_LANG: Readonly<Record<string, string>> = {
  'en-in': 'en-IN-NeerjaNeural',
  'en-us': 'en-US-JennyNeural',
  'en-gb': 'en-GB-SoniaNeural',
  'hi-in': 'hi-IN-SwaraNeural',
  'ta-in': 'ta-IN-PallaviNeural',
  'bn-in': 'bn-IN-TanishaaNeural',
  'mr-in': 'mr-IN-AarohiNeural',
  'te-in': 'te-IN-ShrutiNeural',
  'kn-in': 'kn-IN-SapnaNeural',
  'gu-in': 'gu-IN-DhwaniNeural',
  'ml-in': 'ml-IN-SobhanaNeural',
};

export function defaultVoiceForLang(lang: string): string | undefined {
  return DEFAULT_VOICE_BY_LANG[lang.toLowerCase()];
}

export function knownLanguages(): string[] {
  return Object.values(DEFAULT_VOICE_BY_LANG).map((voice) =>
    voice.slice(0, voice.indexOf('-', voice.indexOf('-') + 1)),
  );
}
