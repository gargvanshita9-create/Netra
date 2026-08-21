import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Object3D } from 'three';
import type { SpeechPacket } from '@netra/contracts';
import { DEFAULT_AVATAR_ASSET, type AvatarAsset } from './avatarAssets';
import { RmsEnvelope } from './lipsync/rms-envelope';
import { useLipsync } from './lipsync/useLipsync';

// Self-hosted Draco decoder (copied from three/examples) — no CDN dependency.
const DRACO_DECODER_PATH = '/draco/';

interface AvatarModelProps {
  packet: SpeechPacket | null;
  asset?: AvatarAsset;
}

/**
 * Apply an asset's rest pose and mesh visibility to the loaded scene, and
 * return the undo. Assets ship in T-pose and gesture clips arrive in A4, so
 * until then the arms are lowered in code.
 *
 * The scene is a shared `useGLTF` cache entry: every mutation here must be
 * reversible, or a remount stacks a second rotation on top of the first.
 */
function applyAssetPose(scene: Object3D, asset: AvatarAsset): () => void {
  const hidden: Object3D[] = [];
  scene.traverse((object) => {
    for (const rotation of asset.restPose) {
      if (!object.name.endsWith(rotation.suffix)) continue;
      object.rotation.x += rotation.x ?? 0;
      object.rotation.y += rotation.y ?? 0;
      object.rotation.z += rotation.z ?? 0;
    }
    if (asset.hiddenMeshes.includes(object.name) && object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });

  return () => {
    scene.traverse((object) => {
      for (const rotation of asset.restPose) {
        if (!object.name.endsWith(rotation.suffix)) continue;
        object.rotation.x -= rotation.x ?? 0;
        object.rotation.y -= rotation.y ?? 0;
        object.rotation.z -= rotation.z ?? 0;
      }
    });
    for (const object of hidden) object.visible = true;
  };
}

function resolveAudioSrc(packet: SpeechPacket): string | undefined {
  if (packet.audioUrl) return packet.audioUrl;
  if (packet.audioBase64) return `data:${packet.audioMimeType};base64,${packet.audioBase64}`;
  return undefined;
}

export function AvatarModel({
  packet,
  asset = DEFAULT_AVATAR_ASSET,
}: AvatarModelProps): React.JSX.Element {
  const { scene } = useGLTF(asset.path, DRACO_DECODER_PATH);
  const audio = useMemo(() => new Audio(), []);
  const envelope = useMemo(() => new RmsEnvelope(), []);

  useEffect(() => applyAssetPose(scene, asset), [scene, asset]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Dev-only handles for the §4.10 validation protocol: `__netraAudio` lets a
    // driver freeze playback at an exact time (the pause test) by stubbing
    // currentTime/paused; `__netraScene` exposes the rig for pose debugging.
    const globals = window as { __netraAudio?: HTMLAudioElement; __netraScene?: Object3D };
    globals.__netraAudio = audio;
    globals.__netraScene = scene;
  }, [audio, scene]);

  useEffect(() => {
    if (!packet) return;
    const src = resolveAudioSrc(packet);
    if (!src) return;
    // Attach inside the play flow — it runs within the user's click
    // activation, which the AudioContext autoplay policy requires.
    envelope.attach(audio);
    audio.src = src;
    audio.currentTime = 0;
    void audio.play();
  }, [packet, audio, envelope]);

  useEffect(() => {
    return () => {
      audio.pause();
      envelope.dispose();
    };
  }, [audio, envelope]);

  useLipsync({ scene, packet, audio, envelope, channelGains: asset.channelGains });

  // dispose={null}: the GLTF is cached by useGLTF and reused across mounts —
  // R3F's default auto-dispose-on-unmount would corrupt that shared cache.
  return <primitive object={scene} rotation={[0, asset.yRotation, 0]} dispose={null} />;
}

// Only the default is preloaded — the alternates are several MB each and are
// fetched on demand when the dev switcher selects them.
useGLTF.preload(DEFAULT_AVATAR_ASSET.path, DRACO_DECODER_PATH);
