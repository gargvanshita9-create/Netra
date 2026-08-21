/**
 * Headless Perfect Sync (AVATAR_DESIGN_SPEC-2 §3.3): copies the 52 ARKit
 * morph targets from the hinzka donor face onto a VRoid Studio VRM export.
 *
 * VRoid face UVs are invariant under face sliders while vertex positions are
 * not, so vertices are matched donor→export by quantised UV lookup. Verified
 * at 100% match on a VRoid Studio 2.14 export against the V110 donor (both
 * 4709 face vertices; the exporters only bucket them differently).
 *
 * Usage: pnpm transfer-blendshapes <in.vrm> <out.glb> [donor.vrm]
 * The donor defaults to scripts/.cache/hinzka-donor.vrm, downloaded from
 * GitHub on first use. Chain with: pnpm prepare-avatar && pnpm inspect-glb.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NodeIO, type Mesh, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const DONOR_URL =
  'https://raw.githubusercontent.com/hinzka/52blendshapes-for-VRoid-face/main/VRoid_V110_Female_v1.1.3.vrm';
// pnpm scripts always run from the repo root.
const DONOR_CACHE = join(process.cwd(), 'scripts', '.cache', 'hinzka-donor.vrm');

const ARKIT_52 = [
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight',
  'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight',
  'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight',
  'mouthFunnel', 'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight',
  'noseSneerLeft', 'noseSneerRight', 'tongueOut',
];

/** UV quantisation for vertex matching; 2^14 ≈ 0.006% of UV space per cell. */
const UV_QUANT = 1 << 14;

function findFaceMesh(meshes: Mesh[]): Mesh {
  const face = meshes.find((mesh) => mesh.getName().startsWith('Face'));
  if (!face) throw new Error('No mesh named Face* found — is this a VRoid export?');
  return face;
}

function getTargetNames(mesh: Mesh): string[] {
  const extras = mesh.getExtras() as Record<string, unknown>;
  return Array.isArray(extras['targetNames']) ? (extras['targetNames'] as unknown[]).map(String) : [];
}

function primAttributes(prim: Primitive): { uv: Float32Array; count: number } {
  const uvAttr = prim.getAttribute('TEXCOORD_0');
  const posAttr = prim.getAttribute('POSITION');
  if (!uvAttr || !posAttr) throw new Error('Face primitive lacks TEXCOORD_0/POSITION');
  return { uv: uvAttr.getArray() as Float32Array, count: posAttr.getCount() };
}

async function ensureDonor(path: string): Promise<void> {
  if (existsSync(path)) return;
  console.log(`Downloading donor model to ${path} …`);
  const response = await fetch(DONOR_URL);
  if (!response.ok) throw new Error(`Donor download failed: HTTP ${response.status}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}

async function main(): Promise<void> {
  const [input, output, donorArg] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: pnpm transfer-blendshapes <in.vrm> <out.glb> [donor.vrm]');
    process.exit(1);
  }
  const donorPath = donorArg ?? DONOR_CACHE;
  await ensureDonor(donorPath);

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const donorDoc = await io.read(donorPath);
  const userDoc = await io.read(input);

  // Donor: every face primitive shares the full-face vertex buffer, so the
  // first primitive carries complete UVs and morph deltas.
  const donorFace = findFaceMesh(donorDoc.getRoot().listMeshes());
  const donorNames = getTargetNames(donorFace);
  const donorPrim = donorFace.listPrimitives()[0];
  if (!donorPrim) throw new Error('Donor face has no primitives');
  const donor = primAttributes(donorPrim);

  const donorDeltas = new Map<string, Float32Array>();
  donorPrim.listTargets().forEach((target, index) => {
    const name = donorNames[index];
    if (name === undefined || !ARKIT_52.includes(name)) return;
    const positions = target.getAttribute('POSITION');
    if (positions) donorDeltas.set(name, positions.getArray() as Float32Array);
  });
  if (donorDeltas.size !== ARKIT_52.length) {
    throw new Error(`Donor is missing ARKit shapes: found ${donorDeltas.size}/52`);
  }

  const uvKey = (u: number, v: number): string =>
    `${Math.round(u * UV_QUANT)},${Math.round(v * UV_QUANT)}`;
  const uvIndex = new Map<string, number>();
  for (let i = 0; i < donor.count; i++) {
    const key = uvKey(donor.uv[i * 2] ?? 0, donor.uv[i * 2 + 1] ?? 0);
    if (!uvIndex.has(key)) uvIndex.set(key, i);
  }
  const lookup = (u: number, v: number): number => {
    const ku = Math.round(u * UV_QUANT);
    const kv = Math.round(v * UV_QUANT);
    for (let du = -2; du <= 2; du++) {
      for (let dv = -2; dv <= 2; dv++) {
        const hit = uvIndex.get(`${ku + du},${kv + dv}`);
        if (hit !== undefined) return hit;
      }
    }
    return -1;
  };

  const userFace = findFaceMesh(userDoc.getRoot().listMeshes());
  const existingNames = getTargetNames(userFace);
  const alreadyPresent = ARKIT_52.filter((n) => existingNames.includes(n));
  if (alreadyPresent.length > 0) {
    throw new Error(`Input already has ARKit shapes (${alreadyPresent.length}) — nothing to do.`);
  }
  const buffer = userDoc.getRoot().listBuffers()[0];
  if (!buffer) throw new Error('Input has no buffer');

  let matched = 0;
  let total = 0;
  for (const prim of userFace.listPrimitives()) {
    const { uv, count } = primAttributes(prim);
    const map = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      map[i] = lookup(uv[i * 2] ?? 0, uv[i * 2 + 1] ?? 0);
      if ((map[i] ?? -1) >= 0) matched++;
    }
    total += count;

    for (const name of ARKIT_52) {
      const delta = donorDeltas.get(name);
      const out = new Float32Array(count * 3);
      if (delta) {
        for (let i = 0; i < count; i++) {
          const d = map[i] ?? -1;
          if (d >= 0) {
            out[i * 3] = delta[d * 3] ?? 0;
            out[i * 3 + 1] = delta[d * 3 + 1] ?? 0;
            out[i * 3 + 2] = delta[d * 3 + 2] ?? 0;
          }
        }
      }
      const accessor = userDoc
        .createAccessor(`${name}.POSITION`)
        .setType('VEC3')
        .setArray(out)
        .setBuffer(buffer);
      prim.addTarget(userDoc.createPrimitiveTarget(name).setAttribute('POSITION', accessor));
    }
  }

  const matchRate = total > 0 ? (matched / total) * 100 : 0;
  console.log(`Matched ${matched}/${total} face vertices by UV (${matchRate.toFixed(1)}%)`);
  if (matchRate < 99) {
    throw new Error(
      'UV match below 99% — face topology likely diverged from the donor. ' +
        'Do NOT ship this; re-check the export settings (no polygon reduction, ' +
        'no transparent-mesh deletion) or fall back to HANA_Tool (§3.3).',
    );
  }

  const extras = userFace.getExtras() as Record<string, unknown>;
  extras['targetNames'] = [...existingNames, ...ARKIT_52];
  userFace.setExtras(extras);
  userFace.setWeights([...userFace.getWeights(), ...ARKIT_52.map(() => 0)]);

  await io.write(output, userDoc);
  console.log(`Written ${output}`);
  console.log(`Next: pnpm prepare-avatar ${output} <final.glb> && pnpm inspect-glb <final.glb>`);
}

main().catch((error: unknown) => {
  console.error('transfer-blendshapes failed:', error);
  process.exit(1);
});
