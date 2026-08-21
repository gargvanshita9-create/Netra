import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Leva, useControls } from 'leva';
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import type { SpeechPacket } from '@netra/contracts';
import { synthesizeSpeech } from '../lib/speech-client';
import { AvatarModel } from './AvatarModel';
import { AVATAR_ASSETS, DEFAULT_AVATAR_ASSET, getAvatarAsset } from './avatarAssets';

const WIDE_VIEWPORT_BREAKPOINT_PX = 1024;
const GREETING_FIXTURE_URL = '/fixtures/greeting.en.json';

/** Languages offered in the dev composer. A6's gate asks for at least three. */
const LANGUAGES: readonly { code: string; label: string }[] = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'en-US', label: 'English (US)' },
];

function useIsWideViewport(): boolean {
  const [isWide, setIsWide] = useState(() => window.innerWidth >= WIDE_VIEWPORT_BREAKPOINT_PX);

  useEffect(() => {
    const handleResize = (): void => {
      setIsWide(window.innerWidth >= WIDE_VIEWPORT_BREAKPOINT_PX);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isWide;
}

interface LoadingFallbackProps {
  anchor: [number, number, number];
}

function LoadingFallback({ anchor }: LoadingFallbackProps): React.JSX.Element {
  // `fullscreen` centers its overlay on wherever `position` projects to on
  // screen — anchoring at the camera's lookAt target guarantees that's the
  // exact screen center, regardless of the framing breakpoint in use.
  return (
    <Html position={anchor} fullscreen>
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-slate-400">Loading avatar…</p>
      </div>
    </Html>
  );
}

export function AvatarStage(): React.JSX.Element {
  const isWide = useIsWideViewport();
  const [packet, setPacket] = useState<SpeechPacket | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [lang, setLang] = useState('en-IN');

  // Dev-only asset switcher — the swap this exercises is the §3.6 architecture
  // check: changing the character must not touch the lip-sync layer.
  const { assetId } = useControls('Avatar asset', {
    assetId: {
      value: DEFAULT_AVATAR_ASSET.id,
      options: Object.fromEntries(AVATAR_ASSETS.map((asset) => [asset.label, asset.id])),
      label: 'model',
    },
  });
  const asset = getAvatarAsset(assetId);

  // Narrow viewports frame head-and-torso (target near head height, camera
  // pulled back enough to include shoulders/chest); wide viewports pull back
  // further and aim lower to fit the full body, feet included.
  // Wide framing leaves ~0.2m of floor below the feet: the assets stand on
  // y=0 and the caption/button overlay covers the bottom of the canvas, so a
  // frame that ends at y=0 hides the feet behind the UI.
  const cameraPosition: [number, number, number] = isWide ? [0, 1.0, 3.5] : [0, 1.55, 1.7];
  const cameraTarget: [number, number, number] = isWide ? [0, 0.9, 0] : [0, 1.5, 0];
  const cameraFov = isWide ? 35 : 30;

  /**
   * Every speech path funnels through here, and every caller must be rooted in
   * a real click or keypress. `RmsEnvelope.attach()` runs downstream of this in
   * AvatarModel's play effect and needs the page to have user activation — an
   * AudioContext that never unlocks produces silence from the analyser, which
   * looks like a subtly lifeless avatar rather than like an error.
   */
  const speak = async (load: () => Promise<SpeechPacket>): Promise<void> => {
    setIsPreparing(true);
    setError(null);
    try {
      const data = await load();
      // Replace with a fresh object even for identical speech, so replaying the
      // same sentence — or receiving the same cached packet back from the API —
      // still re-triggers AvatarModel's play effect.
      setPacket({ ...data });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Netra could not reach the speech service. Check the API is running.',
      );
    } finally {
      setIsPreparing(false);
    }
  };

  const handlePlayGreeting = (): void => {
    void speak(async () => {
      const response = await fetch(GREETING_FIXTURE_URL);
      if (!response.ok) {
        throw new Error(`The greeting fixture could not be loaded (HTTP ${response.status}).`);
      }
      return (await response.json()) as SpeechPacket;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void speak(() => synthesizeSpeech({ text, lang, gesture: 'talking_neutral' }));
  };

  return (
    <div className="relative h-full w-full">
      <Canvas dpr={[1, 2]}>
        <color attach="background" args={['#3b3a3e']} />
        <PerspectiveCamera
          makeDefault
          position={cameraPosition}
          fov={cameraFov}
          // Aim independently of OrbitControls, which is dev-only below —
          // production builds must still frame correctly with no controls mounted.
          onUpdate={(camera: ThreePerspectiveCamera) => camera.lookAt(...cameraTarget)}
        />
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 3, 2]} intensity={1.2} />
        <directionalLight position={[-2, 1.5, -1]} intensity={0.35} />
        <Suspense fallback={<LoadingFallback anchor={cameraTarget} />}>
          <AvatarModel packet={packet} asset={asset} />
        </Suspense>
        {import.meta.env.DEV && <OrbitControls target={cameraTarget} />}
      </Canvas>

      <div className="absolute bottom-6 left-1/2 flex w-full max-w-xl -translate-x-1/2 flex-col items-center gap-3 px-4">
        {/* Captions. Non-negotiable per §5.1 A7, and they make a muted demo legible. */}
        {packet && <p className="text-center text-sm text-slate-300">{packet.text}</p>}

        {error && (
          <p
            role="alert"
            className="max-h-32 overflow-y-auto whitespace-pre-line rounded-lg bg-red-950/80 px-3 py-2 text-center text-xs text-red-200"
          >
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <label className="sr-only" htmlFor="netra-lang">
            Language
          </label>
          <select
            id="netra-lang"
            value={lang}
            onChange={(event) => setLang(event.target.value)}
            className="rounded-full bg-slate-800 px-3 py-2 text-sm text-slate-200"
          >
            {LANGUAGES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="netra-text">
            What should Netra say?
          </label>
          <input
            id="netra-text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type something for Netra to say…"
            className="min-w-0 flex-1 rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />

          <button
            type="submit"
            disabled={isPreparing || draft.trim() === ''}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
          >
            {isPreparing ? 'Thinking…' : 'Speak'}
          </button>
        </form>

        <button
          type="button"
          onClick={handlePlayGreeting}
          disabled={isPreparing}
          className="text-xs text-slate-400 underline underline-offset-4 disabled:opacity-50"
        >
          Play the greeting fixture
        </button>
      </div>

      <Leva hidden={!import.meta.env.DEV} />
    </div>
  );
}
