/**
 * A6 credential and voice-name validator. Run once, the moment
 * AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set:
 *
 *   pnpm verify-speech

 * Reads the repo-root .env via node's --env-file, so it needs no dotenv dep.
 *
 * Checks, in order, so the first failure is the informative one:
 *   1. the key and region are accepted at all
 *   2. every voice named in apps/api/src/speech/voices.ts exists in that region
 *   3. a real synthesis returns audio AND a viseme event stream
 *
 * (3) is the one that matters. Azure was chosen over better-sounding providers
 * purely for its timestamped viseme stream (PROJECT_PLAN.md §5.3); audio
 * without visemes silently drops the avatar onto amplitude-driven jaw motion,
 * which is the failure this whole phase exists to avoid.
 *
 * Costs one synthesis of a short sentence — a few dozen characters against a
 * 500,000-character monthly free tier.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY = process.env['AZURE_SPEECH_KEY'];
const REGION = process.env['AZURE_SPEECH_REGION'];

const PROBE_TEXT = 'Deposits grew nine percent last quarter.';
const PROBE_LANG = 'en-IN';

interface AzureVoice {
  Name: string;
  ShortName: string;
  Locale: string;
}

/** Reads the voice names out of voices.ts rather than duplicating the list. */
function voiceNamesUnderTest(): string[] {
  const source = readFileSync(
    join(__dirname, '..', 'src', 'speech', 'voices.ts'),
    'utf8',
  );
  const table = source.slice(
    source.indexOf('DEFAULT_VOICE_BY_LANG'),
    source.indexOf('};', source.indexOf('DEFAULT_VOICE_BY_LANG')),
  );
  return [...table.matchAll(/'([a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural)'/gu)].map((match) => match[1] ?? '');
}

async function listVoices(): Promise<AzureVoice[]> {
  const response = await fetch(
    `https://${REGION ?? ''}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
    { headers: { 'Ocp-Apim-Subscription-Key': KEY ?? '' } },
  );
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Azure rejected the key (HTTP ${response.status}). Check AZURE_SPEECH_KEY is KEY 1 or KEY 2 ` +
        `from the resource's "Keys and Endpoint" blade, and that AZURE_SPEECH_REGION ("${REGION ?? ''}") ` +
        'is the same resource\'s region.',
    );
  }
  if (response.status === 404) {
    throw new Error(
      `No Speech endpoint at region "${REGION ?? ''}". It must be the short code — "centralindia", ` +
        '"eastus" — not the display name ("Central India").',
    );
  }
  if (!response.ok) throw new Error(`Voice list failed: HTTP ${response.status}.`);
  return (await response.json()) as AzureVoice[];
}

/** Synthesises via SSML and reports whether viseme events came back. */
async function probeSynthesis(voice: string): Promise<void> {
  const sdk = await import('microsoft-cognitiveservices-speech-sdk');
  const speechConfig = sdk.SpeechConfig.fromSubscription(KEY ?? '', REGION ?? '');
  speechConfig.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

  let visemeCount = 0;
  synthesizer.visemeReceived = () => {
    visemeCount += 1;
  };

  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${PROBE_LANG}">` +
    `<voice name="${voice}"><mstts:viseme type="redlips_front"/>${PROBE_TEXT}</voice></speak>`;

  try {
    const result = await new Promise<import('microsoft-cognitiveservices-speech-sdk').SpeechSynthesisResult>(
      (resolve, reject) => {
        synthesizer.speakSsmlAsync(ssml, resolve, (error) => reject(new Error(error)));
      },
    );

    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
      throw new Error(`Synthesis failed: ${result.errorDetails || 'no detail given'}`);
    }

    const bytes = result.audioData.byteLength;
    console.log(`✅ Synthesis returned ${bytes.toLocaleString()} bytes of audio.`);

    if (visemeCount > 0) {
      console.log(`✅ Viseme stream present: ${visemeCount} events — lip-sync will be phoneme-driven.`);
    } else {
      console.log(
        '❌ No viseme events. Audio works, but the avatar would fall back to amplitude-driven\n' +
          '   jaw motion — the thing Azure was chosen to avoid. Check the voice supports visemes.',
      );
      process.exitCode = 1;
    }
  } finally {
    synthesizer.close();
  }
}

async function main(): Promise<void> {
  if (!KEY || !REGION) {
    console.error(
      'AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must both be set in .env.\n' +
        'Get them from the Azure portal: your Speech resource → Keys and Endpoint.',
    );
    process.exit(1);
  }

  console.log(`Region: ${REGION}\n`);

  const voices = await listVoices();
  const available = new Set(voices.map((voice) => voice.ShortName));
  console.log(`✅ Key accepted. ${voices.length} voices available in ${REGION}.\n`);

  console.log('--- Voice names in apps/api/src/speech/voices.ts ---');
  const missing: string[] = [];
  for (const name of voiceNamesUnderTest()) {
    const ok = available.has(name);
    if (!ok) missing.push(name);
    console.log(`${ok ? '✅' : '❌'} ${name}`);
  }

  if (missing.length > 0) {
    console.log(
      `\n⚠️  ${missing.length} voice name(s) do not exist in this region. Requests for those ` +
        'languages will fail. Pick replacements from the list above and edit voices.ts.',
    );
    const suggestions = voices
      .filter((voice) => missing.some((name) => voice.Locale === name.split('-').slice(0, 2).join('-')))
      .map((voice) => `  ${voice.Locale}: ${voice.ShortName}`);
    if (suggestions.length > 0) console.log(`\nAvailable in those locales:\n${suggestions.join('\n')}`);
    process.exitCode = 1;
  }

  console.log('\n--- Live synthesis probe ---');
  await probeSynthesis('en-IN-NeerjaNeural');

  if (process.exitCode === 1) {
    console.log('\nResult: PROBLEMS FOUND — see above before setting NETRA_TTS_MODE=live.');
  } else {
    console.log('\nResult: PASS. Set NETRA_TTS_MODE=live and the avatar will speak arbitrary text.');
  }
}

main().catch((error: unknown) => {
  console.error(`\nverify-speech failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
