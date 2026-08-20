import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useControls } from 'leva';
import type { SpeechPacket } from '@netra/contracts';
import { useVisemePlayer } from './useVisemePlayer';

const MODEL_PATH = '/models/brunette.glb';

interface AvatarModelProps {
  packet: SpeechPacket | null;
}

function resolveAudioSrc(packet: SpeechPacket): string | undefined {
  if (packet.audioUrl) return packet.audioUrl;
  if (packet.audioBase64) return `data:${packet.audioMimeType};base64,${packet.audioBase64}`;
  return undefined;
}

export function AvatarModel({ packet }: AvatarModelProps): React.JSX.Element {
  const { scene } = useGLTF(MODEL_PATH);
  const audio = useMemo(() => new Audio(), []);
  const { smoothing } = useControls('Viseme Player', {
    smoothing: { value: 0.4, min: 0.05, max: 1, step: 0.05 },
  });

  useEffect(() => {
    if (!packet) return;
    const src = resolveAudioSrc(packet);
    if (!src) return;
    audio.src = src;
    audio.currentTime = 0;
    void audio.play();
  }, [packet, audio]);

  useEffect(() => {
    return () => {
      audio.pause();
    };
  }, [audio]);

  useVisemePlayer({ scene, visemes: packet?.visemes ?? [], audio, smoothing });

  // dispose={null}: the GLTF is cached by useGLTF and reused across mounts —
  // R3F's default auto-dispose-on-unmount would corrupt that shared cache.
  return <primitive object={scene} dispose={null} />;
}

useGLTF.preload(MODEL_PATH);
