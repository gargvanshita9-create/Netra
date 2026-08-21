import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { Bone } from 'three';
import type { Euler, Mesh, Object3D } from 'three';
import type { SpeechPacket } from '@netra/contracts';
import { CHANNEL_COUNT, CHANNEL_INDEX, LIPSYNC_CHANNELS } from './channels';
import { LipsyncEngine } from './engine';
import { RmsEnvelope } from './rms-envelope';
import { SecondaryMotion } from './secondary-motion';

interface MorphMesh extends Mesh {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
}

function hasMorphTargets(object: Object3D): object is MorphMesh {
  const mesh = object as Partial<MorphMesh>;
  return Boolean(mesh.morphTargetDictionary && mesh.morphTargetInfluences);
}

interface MeshBinding {
  influences: number[];
  /** Engine channel index → morph index for this mesh, −1 when absent. */
  channelToMorph: Int32Array;
  browInnerUp: number;
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
}

interface BoneBinding {
  bone: Bone;
  /** Rest rotation captured at bind time; secondary motion is additive. */
  baseRotation: Euler;
}

interface SceneBinding {
  meshes: MeshBinding[];
  head: BoneBinding | null;
  leftEye: BoneBinding | null;
  rightEye: BoneBinding | null;
}

function bindBone(bone: Bone): BoneBinding {
  return { bone, baseRotation: bone.rotation.clone() };
}

function buildSceneBinding(scene: Object3D): SceneBinding {
  const meshes: MeshBinding[] = [];
  let head: BoneBinding | null = null;
  let leftEye: BoneBinding | null = null;
  let rightEye: BoneBinding | null = null;

  scene.traverse((object) => {
    if (hasMorphTargets(object)) {
      const dictionary = object.morphTargetDictionary;
      const channelToMorph = new Int32Array(CHANNEL_COUNT).fill(-1);
      let hasAnyChannel = false;
      for (let c = 0; c < CHANNEL_COUNT; c++) {
        const channel = LIPSYNC_CHANNELS[c];
        if (!channel) continue;
        const morphIndex = dictionary[channel];
        if (morphIndex !== undefined) {
          channelToMorph[c] = morphIndex;
          hasAnyChannel = true;
        }
      }
      const browInnerUp = dictionary['browInnerUp'] ?? -1;
      const eyeBlinkLeft = dictionary['eyeBlinkLeft'] ?? -1;
      const eyeBlinkRight = dictionary['eyeBlinkRight'] ?? -1;
      if (hasAnyChannel || browInnerUp >= 0 || eyeBlinkLeft >= 0 || eyeBlinkRight >= 0) {
        meshes.push({
          influences: object.morphTargetInfluences,
          channelToMorph,
          browInnerUp,
          eyeBlinkLeft,
          eyeBlinkRight,
        });
      }
    }
    if (object instanceof Bone) {
      // endsWith covers prefixed rigs (mixamorig:Head) and excludes HeadTop_End.
      // Eye patterns cover Mixamo/RPM (LeftEye) and VRoid (J_Adj_L_FaceEye).
      if (!head && object.name.endsWith('Head')) head = bindBone(object);
      else if (!leftEye && (object.name.includes('LeftEye') || object.name.includes('L_FaceEye')))
        leftEye = bindBone(object);
      else if (
        !rightEye &&
        (object.name.includes('RightEye') || object.name.includes('R_FaceEye'))
      )
        rightEye = bindBone(object);
    }
  });

  return { meshes, head, leftEye, rightEye };
}

function applyGaze(eye: BoneBinding | null, pitchRad: number, yawRad: number): void {
  if (!eye) return;
  eye.bone.rotation.set(
    eye.baseRotation.x + pitchRad,
    eye.baseRotation.y + yawRad,
    eye.baseRotation.z,
  );
}

const JAW_OPEN = CHANNEL_INDEX.jawOpen;
/** Peak jaw opening for the amplitude-only fallback (empty viseme timeline). */
const FALLBACK_JAW_GAIN = 0.5;
/** Azure viseme 0 — silence. A timeline of only these articulates nothing. */
const SILENCE_VISEME_ID = 0;

export interface UseLipsyncOptions {
  /** Root of the loaded avatar — traversed once for morph meshes and bones. */
  scene: Object3D;
  packet: SpeechPacket | null;
  audio: HTMLAudioElement;
  envelope: RmsEnvelope;
  /** Per-asset output calibration by channel name; omitted channels are 1. */
  channelGains?: Readonly<Record<string, number>>;
}

/**
 * Drives the avatar from a SpeechPacket: the coarticulation engine (§4.1
 * steps ①–⑥) composes ARKit morph weights from the viseme timeline, secondary
 * motion (step ⑦) keeps her alive between and during sentences. Mutates morph
 * influences and bone rotations directly — no setState in the render loop.
 */
export function useLipsync({
  scene,
  packet,
  audio,
  envelope,
  channelGains,
}: UseLipsyncOptions): void {
  const engine = useMemo(() => new LipsyncEngine(), []);
  const secondary = useMemo(() => new SecondaryMotion(), []);
  const binding = useMemo(() => buildSceneBinding(scene), [scene]);

  useEffect(() => {
    engine.channelGain.fill(1);
    for (let c = 0; c < CHANNEL_COUNT; c++) {
      const channel = LIPSYNC_CHANNELS[c];
      if (!channel) continue;
      engine.channelGain[c] = channelGains?.[channel] ?? 1;
    }
  }, [engine, channelGains]);

  // §4.11 tuning workflow: every constant reachable via leva, live.
  const timingCtl = useControls('Lipsync · Timing', {
    leadMs: { value: 40, min: 0, max: 100, step: 1 },
    windowMs: { value: 120, min: 40, max: 250, step: 5 },
    sigmaPlosiveMs: { value: 25, min: 5, max: 120, step: 1 },
    sigmaFricativeMs: { value: 40, min: 5, max: 120, step: 1 },
    sigmaNasalMs: { value: 40, min: 5, max: 120, step: 1 },
    sigmaVowelMs: { value: 70, min: 5, max: 160, step: 1 },
  });
  const dominanceCtl = useControls('Lipsync · Dominance', {
    bilabial: { value: 1.0, min: 0, max: 1, step: 0.05 },
    rounding: { value: 0.8, min: 0, max: 1, step: 0.05 },
    jaw: { value: 0.6, min: 0, max: 1, step: 0.05 },
    spreading: { value: 0.5, min: 0, max: 1, step: 0.05 },
    tongue: { value: 0.9, min: 0, max: 1, step: 0.05 },
    other: { value: 0.6, min: 0, max: 1, step: 0.05 },
    floor: { value: 0.15, min: 0, max: 1, step: 0.05 },
  });
  const envelopeCtl = useControls('Lipsync · Attack/Release', {
    attackPlosiveMs: { value: 25, min: 5, max: 200, step: 1 },
    attackFricativeMs: { value: 45, min: 5, max: 200, step: 1 },
    attackNasalMs: { value: 55, min: 5, max: 200, step: 1 },
    attackVowelMs: { value: 80, min: 5, max: 200, step: 1 },
    releasePlosiveMs: { value: 40, min: 5, max: 250, step: 1 },
    releaseFricativeMs: { value: 55, min: 5, max: 250, step: 1 },
    releaseNasalMs: { value: 65, min: 5, max: 250, step: 1 },
    releaseVowelMs: { value: 100, min: 5, max: 250, step: 1 },
    silenceReleaseMs: { value: 140, min: 20, max: 400, step: 5 },
  });
  // Spec §4.5 values. Assets that seal below 1.0 are handled by the registry's
  // channelGains, not by weakening these.
  const closureCtl = useControls('Lipsync · Closure', {
    bilabialMouthClose: { value: 0.9, min: 0, max: 1, step: 0.05 },
    bilabialJawOpenMax: { value: 0.03, min: 0, max: 0.2, step: 0.01 },
    labiodentalRollLower: { value: 0.25, min: 0, max: 1, step: 0.05 },
  });
  const amplitudeCtl = useControls('Lipsync · Amplitude', {
    jawRmsBase: { value: 0.55, min: 0, max: 1, step: 0.05 },
    jawRmsGain: { value: 0.75, min: 0, max: 1.5, step: 0.05 },
    stretchRmsBase: { value: 0.85, min: 0, max: 1, step: 0.05 },
    stretchRmsGain: { value: 0.3, min: 0, max: 1, step: 0.05 },
  });
  const secondaryCtl = useControls('Lipsync · Secondary', {
    browGain: { value: 0.15, min: 0, max: 0.5, step: 0.01 },
    nodDegrees: { value: 2, min: 0, max: 8, step: 0.5 },
    yawDriftDegrees: { value: 3, min: 0, max: 10, step: 0.5 },
    saccadeDegrees: { value: 3, min: 0, max: 8, step: 0.5 },
  });

  // Copy leva values into the engines every render — cheap, and keeps the
  // frame loop free of React state reads.
  useEffect(() => {
    const tuning = engine.tuning;
    tuning.leadMs = timingCtl.leadMs;
    tuning.windowMs = timingCtl.windowMs;
    tuning.sigmaMs.plosive = timingCtl.sigmaPlosiveMs;
    tuning.sigmaMs.fricative = timingCtl.sigmaFricativeMs;
    tuning.sigmaMs.nasal = timingCtl.sigmaNasalMs;
    tuning.sigmaMs.vowel = timingCtl.sigmaVowelMs;
    tuning.dominance.bilabial = dominanceCtl.bilabial;
    tuning.dominance.rounding = dominanceCtl.rounding;
    tuning.dominance.jaw = dominanceCtl.jaw;
    tuning.dominance.spreading = dominanceCtl.spreading;
    tuning.dominance.tongue = dominanceCtl.tongue;
    tuning.dominance.other = dominanceCtl.other;
    tuning.dominanceFloor = dominanceCtl.floor;
    engine.refreshDominance();
    tuning.attackMs.plosive = envelopeCtl.attackPlosiveMs;
    tuning.attackMs.fricative = envelopeCtl.attackFricativeMs;
    tuning.attackMs.nasal = envelopeCtl.attackNasalMs;
    tuning.attackMs.vowel = envelopeCtl.attackVowelMs;
    tuning.releaseMs.plosive = envelopeCtl.releasePlosiveMs;
    tuning.releaseMs.fricative = envelopeCtl.releaseFricativeMs;
    tuning.releaseMs.nasal = envelopeCtl.releaseNasalMs;
    tuning.releaseMs.vowel = envelopeCtl.releaseVowelMs;
    tuning.silenceReleaseMs = envelopeCtl.silenceReleaseMs;
    tuning.bilabialMouthClose = closureCtl.bilabialMouthClose;
    tuning.bilabialJawOpenMax = closureCtl.bilabialJawOpenMax;
    tuning.labiodentalRollLower = closureCtl.labiodentalRollLower;
    tuning.jawRmsBase = amplitudeCtl.jawRmsBase;
    tuning.jawRmsGain = amplitudeCtl.jawRmsGain;
    tuning.stretchRmsBase = amplitudeCtl.stretchRmsBase;
    tuning.stretchRmsGain = amplitudeCtl.stretchRmsGain;
    secondary.tuning.browGain = secondaryCtl.browGain;
    secondary.tuning.nodDegrees = secondaryCtl.nodDegrees;
    secondary.tuning.yawDriftDegrees = secondaryCtl.yawDriftDegrees;
    secondary.tuning.saccadeDegrees = secondaryCtl.saccadeDegrees;
  });

  useEffect(() => {
    engine.setTimeline(packet?.visemes ?? [], packet?.durationMs ?? 0);
  }, [engine, packet]);

  /**
   * Whether the timeline actually articulates anything.
   *
   * The contract says an empty timeline means "fall back to an amplitude-driven
   * jaw", but a timeline of nothing but silence frames means the same thing and
   * would otherwise hold the mouth shut for the whole utterance — a frozen face
   * with no error anywhere. Some Azure locales synthesise audio without a
   * viseme stream and produce exactly that shape.
   *
   * The API normalises this case today; this check makes the avatar layer
   * correct for any producer, which is what the frozen contract is for.
   */
  const hasArticulation = useMemo(
    () => (packet?.visemes ?? []).some((frame) => frame.visemeId !== SILENCE_VISEME_ID),
    [packet],
  );

  useFrame((state, delta) => {
    const dtSeconds = Math.min(delta, 0.1); // clamp tab-switch spikes
    const speaking = !audio.paused && !audio.ended;
    const rms = envelope.update(dtSeconds);

    engine.update(speaking ? audio.currentTime * 1000 : null, dtSeconds * 1000, rms);
    secondary.update(dtSeconds, state.clock.elapsedTime, rms, speaking);

    // No articulation to play ⇒ drive the jaw from loudness rather than
    // leaving a frozen mouth.
    const jawFallback = speaking && !hasArticulation ? rms * FALLBACK_JAW_GAIN : null;

    const output = engine.output;
    for (const mesh of binding.meshes) {
      const { influences, channelToMorph } = mesh;
      for (let c = 0; c < CHANNEL_COUNT; c++) {
        const morphIndex = channelToMorph[c] ?? -1;
        if (morphIndex < 0) continue;
        influences[morphIndex] = output[c] ?? 0;
      }
      if (jawFallback !== null) {
        const jawIndex = channelToMorph[JAW_OPEN] ?? -1;
        if (jawIndex >= 0) influences[jawIndex] = jawFallback;
      }
      if (mesh.browInnerUp >= 0) influences[mesh.browInnerUp] = secondary.browInnerUp;
      if (mesh.eyeBlinkLeft >= 0) influences[mesh.eyeBlinkLeft] = secondary.eyeBlink;
      if (mesh.eyeBlinkRight >= 0) influences[mesh.eyeBlinkRight] = secondary.eyeBlink;
    }

    if (binding.head) {
      const { bone, baseRotation } = binding.head;
      bone.rotation.set(
        baseRotation.x + secondary.headPitchRad,
        baseRotation.y + secondary.headYawRad,
        baseRotation.z,
      );
    }
    applyGaze(binding.leftEye, secondary.eyePitchRad, secondary.eyeYawRad);
    applyGaze(binding.rightEye, secondary.eyePitchRad, secondary.eyeYawRad);
  });
}
