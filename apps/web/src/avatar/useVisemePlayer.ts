import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Mesh, type Object3D } from 'three';
import type { VisemeFrame } from '@netra/contracts';
import { ALL_VISEME_TARGETS, VISEME_MAP } from './visemeMap';

interface MorphMesh extends Mesh {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
}

function hasMorphTargets(object: Object3D): object is MorphMesh {
  const mesh = object as Partial<MorphMesh>;
  return Boolean(mesh.morphTargetDictionary && mesh.morphTargetInfluences);
}

interface UseVisemePlayerOptions {
  /** Root of the loaded avatar — traversed once to find morph-target meshes. */
  scene: Object3D;
  /** Ordered ascending by timeMs. Empty ⇒ mouth relaxes to silence. */
  visemes: VisemeFrame[];
  audio: HTMLAudioElement | null;
  /** Lerp factor per frame, ~0.3–0.5 reads as natural. Exposed via leva for live tuning. */
  smoothing?: number;
}

/**
 * Drives viseme morph-target influences from `audio.currentTime` every frame.
 * Mutates mesh arrays directly — no setState in the render loop (CLAUDE.md).
 */
export function useVisemePlayer({
  scene,
  visemes,
  audio,
  smoothing = 0.4,
}: UseVisemePlayerOptions): void {
  const morphMeshesRef = useRef<MorphMesh[]>([]);
  const cursorRef = useRef(0);

  useEffect(() => {
    const meshes: MorphMesh[] = [];
    scene.traverse((object) => {
      if (hasMorphTargets(object)) meshes.push(object);
    });
    morphMeshesRef.current = meshes;
    cursorRef.current = 0;
  }, [scene]);

  useFrame(() => {
    const meshes = morphMeshesRef.current;
    if (meshes.length === 0) return;

    let activeVisemeId = 0; // silence by default — no audio, paused, or empty timeline

    if (audio && !audio.paused && visemes.length > 0) {
      const currentMs = audio.currentTime * 1000;
      let cursor = cursorRef.current;
      // Seeking/looping backward — restart the scan from the top.
      if (cursor > 0 && (visemes[cursor]?.timeMs ?? 0) > currentMs) cursor = 0;
      while (cursor + 1 < visemes.length && (visemes[cursor + 1]?.timeMs ?? Infinity) <= currentMs) {
        cursor++;
      }
      cursorRef.current = cursor;
      activeVisemeId = visemes[cursor]?.visemeId ?? 0;
    }

    const activeTarget = VISEME_MAP[activeVisemeId] ?? 'viseme_sil';

    for (const mesh of meshes) {
      const { morphTargetDictionary: dict, morphTargetInfluences: influences } = mesh;
      for (const targetName of ALL_VISEME_TARGETS) {
        const index = dict[targetName];
        if (index === undefined) continue;
        const goal = targetName === activeTarget ? 1 : 0;
        influences[index] = MathUtils.lerp(influences[index] ?? 0, goal, smoothing);
      }
    }
  });
}
