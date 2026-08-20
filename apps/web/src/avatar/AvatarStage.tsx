import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Leva } from 'leva';
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import type { SpeechPacket } from '@netra/contracts';
import { AvatarModel } from './AvatarModel';

const WIDE_VIEWPORT_BREAKPOINT_PX = 1024;
const GREETING_FIXTURE_URL = '/fixtures/greeting.en.json';

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
  const [isFetchingFixture, setIsFetchingFixture] = useState(false);

  // Narrow viewports frame head-and-torso (target near head height, camera
  // pulled back enough to include shoulders/chest); wide viewports pull back
  // further and aim lower to fit the full body, feet included.
  const cameraPosition: [number, number, number] = isWide ? [0, 1.3, 3.2] : [0, 1.55, 1.7];
  const cameraTarget: [number, number, number] = isWide ? [0, 1.0, 0] : [0, 1.5, 0];
  const cameraFov = isWide ? 35 : 30;

  const handlePlayGreeting = async (): Promise<void> => {
    setIsFetchingFixture(true);
    try {
      const response = await fetch(GREETING_FIXTURE_URL);
      const data = (await response.json()) as SpeechPacket;
      // Replace with a fresh object even for the same fixture, so replaying
      // the same clip twice still re-triggers AvatarModel's play effect.
      setPacket({ ...data });
    } finally {
      setIsFetchingFixture(false);
    }
  };

  return (
    <div className="relative h-full w-full">
      <Canvas dpr={[1, 2]}>
        <color attach="background" args={['#0b0e14']} />
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
          <AvatarModel packet={packet} />
        </Suspense>
        {import.meta.env.DEV && <OrbitControls target={cameraTarget} />}
      </Canvas>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 px-4">
        {packet && (
          <p className="max-w-md text-center text-sm text-slate-300">{packet.text}</p>
        )}
        <button
          type="button"
          onClick={() => void handlePlayGreeting()}
          disabled={isFetchingFixture}
          className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          {isFetchingFixture ? 'Loading…' : 'Play greeting'}
        </button>
      </div>

      <Leva hidden={!import.meta.env.DEV} />
    </div>
  );
}
