/**
 * Candidate avatar assets. Every entry has passed `pnpm inspect-glb`
 * (AVATAR_DESIGN_SPEC-2 §2.5) and is driven by the same lip-sync engine —
 * the differences here are rig conventions, not capabilities.
 *
 * Keeping more than one is deliberate: the spec's §3.6 warns that if swapping
 * the asset is painful, the architecture is wrong. A registry keeps that swap
 * honest and testable.
 */

/** Additive bone rotation, keyed by bone-name suffix. */
export interface RestPoseRotation {
  /** Matched with `name.endsWith(suffix)`. */
  suffix: string;
  /** Radians added to the bone's rest rotation, per axis. */
  x?: number;
  y?: number;
  z?: number;
}

export interface AvatarAsset {
  id: string;
  /** Shown in the dev asset switcher. */
  label: string;
  path: string;
  /** Y rotation applied to the loaded scene so she faces the camera (+Z). */
  yRotation: number;
  /**
   * Applied when the asset ships in T-pose and has no idle clip yet.
   * Superseded per-asset once A4 gesture clips land.
   */
  restPose: readonly RestPoseRotation[];
  /** Meshes hidden on load, by exact name. */
  hiddenMeshes: readonly string[];
  /**
   * Output calibration for the lip-sync engine, by channel name. An ARKit
   * weight of 1.0 deforms each model by a different amount, so this is where
   * "this asset's mouthClose seals at 0.8" belongs — not in the recipes.
   * Omitted channels default to 1.
   */
  channelGains: Readonly<Record<string, number>>;
  /** Anything a future reader would otherwise have to rediscover. */
  notes: string;
}

/** VRoid arms point down the ±X axis in T-pose; drop them to the sides. */
const VROID_ARMS_DOWN: readonly RestPoseRotation[] = [
  { suffix: 'L_UpperArm', z: -1.15 },
  { suffix: 'R_UpperArm', z: 1.15 },
  { suffix: 'L_LowerArm', z: -0.1 },
  { suffix: 'R_LowerArm', z: 0.1 },
];

/**
 * Mixamo-named rigs (Avaturn, RPM) orient each arm bone's local Z down the
 * limb, so Z twists and X is the swing axis — and because both arm bones share
 * that local orientation, both lower with the *same* sign, not mirrored ones.
 * Verified empirically against the rig; see docs/DECISIONS.md.
 */
const MIXAMO_ARMS_DOWN: readonly RestPoseRotation[] = [
  { suffix: 'LeftArm', x: 1.2 },
  { suffix: 'RightArm', x: 1.2 },
  { suffix: 'LeftForeArm', x: 0.2 },
  { suffix: 'RightForeArm', x: 0.2 },
];

/**
 * Rig axis conventions, established empirically by driving each bone on the
 * live scene and looking. Recorded for A4's gesture work, which will need
 * them — a procedural gesture layer built on guessed axes was tried and
 * removed (ADR-015), and re-deriving these is the expensive part.
 *
 *                       shoulder swing        elbow flex
 *   VRoid  (J_Bip_*)    Z, mirrored signs     Z, mirrored signs
 *   Mixamo (Avaturn)    X, *same* sign both   Z, mirrored signs
 *
 * On both rigs the arm bone's local Z runs down the limb at the shoulder, so
 * Z twists there rather than swinging. The wrist deviates sideways rather
 * than flexing on every axis tried, which is why hand motion needs authored
 * poses rather than a rotation offset.
 */

export const AVATAR_ASSETS: readonly AvatarAsset[] = [
  {
    id: 'netra-vroid',
    label: 'Netra (VRoid, anime)',
    path: '/models/netra.glb',
    // VRM 1.0 follows the glTF convention and already faces +Z.
    yRotation: 0,
    restPose: VROID_ARMS_DOWN,
    hiddenMeshes: [],
    // Lips seal well below 1.0 on this face; pressing harder crumples the
    // geometry past contact (verified on frozen bilabial frames).
    channelGains: {
      mouthClose: 0.8,
      mouthPressLeft: 0.35,
      mouthPressRight: 0.35,
      mouthRollLower: 0.6,
    },
    notes:
      'User-designed in VRoid Studio; ARKit 52 transferred from the hinzka donor ' +
      'via `pnpm transfer-blendshapes` (ADR-012). Teeth/tongue are fused to the ' +
      'face mesh — below §2.2, acceptable at this stylisation level, and the ' +
      'reason tongueOut needs no attenuation here.',
  },
  {
    id: 'avaturn',
    label: 'Avaturn (semi-realistic)',
    path: '/models/avaturn.glb',
    yRotation: 0,
    restPose: MIXAMO_ARMS_DOWN,
    // Nothing hidden: the footwear is off-brief (§1.3 wants a low block heel
    // or flat) but hiding it left her with no feet at all, which reads worse
    // than the wrong shoes. Replace the shoes in Avaturn instead.
    hiddenMeshes: [],
    // This model has a real Tongue_Mesh whose tongueOut morph protrudes the
    // tongue past the lips, so the spec's amounts (0.22 on TH) read as
    // sticking her tongue out. Scaled to a tip-behind-the-teeth suggestion.
    channelGains: { tongueOut: 0.3 },
    notes:
      'Kept as the semi-realistic option. Meets §2.2 more fully than the VRoid ' +
      'asset — separate Teeth_Mesh and Tongue_Mesh — and §2.4 with Mixamo bone ' +
      'names and full finger joints. Free-tier export: non-commercial only.',
  },
];

export const DEFAULT_AVATAR_ASSET: AvatarAsset = AVATAR_ASSETS[0] as AvatarAsset;

export function getAvatarAsset(id: string): AvatarAsset {
  return AVATAR_ASSETS.find((asset) => asset.id === id) ?? DEFAULT_AVATAR_ASSET;
}
