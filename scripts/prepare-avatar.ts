/**
 * Avatar asset pipeline (AVATAR_DESIGN_SPEC-2 §3.2 steps 3–6): takes a VRM 0.0
 * export (VRoid Studio + Perfect Sync) and produces a web-ready GLB —
 * textures resized to 1024 + WebP, unused morph targets stripped, Draco
 * compressed. Run the §2.5 gate afterwards: `pnpm inspect-glb <output>`.
 *
 * Usage: pnpm prepare-avatar <input.vrm> <output.glb>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

/** Morph targets the avatar layer drives (ARKit 52 + VRM emotion presets). */
const KEEP_MORPHS = new Set([
  ...[
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
  ],
  ...['Fcl_ALL_Neutral', 'Fcl_ALL_Joy', 'Fcl_ALL_Fun', 'Fcl_ALL_Sorrow', 'Fcl_ALL_Angry', 'Fcl_ALL_Surprised'],
]);

function gltfTransform(args: string[]): void {
  execFileSync('npx', ['--yes', '@gltf-transform/cli', ...args], { stdio: 'inherit' });
}

async function pruneMorphTargets(inPath: string, outPath: string): Promise<void> {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const document = await io.read(inPath);

  for (const mesh of document.getRoot().listMeshes()) {
    const extras = mesh.getExtras() as Record<string, unknown>;
    const names = Array.isArray(extras['targetNames'])
      ? (extras['targetNames'] as unknown[]).map(String)
      : [];
    if (names.length === 0) continue;

    const keepIndices = names.map((n, i) => (KEEP_MORPHS.has(n) ? i : -1)).filter((i) => i >= 0);
    console.log(`  ${mesh.getName()}: ${names.length} → ${keepIndices.length} morph targets`);
    for (const primitive of mesh.listPrimitives()) {
      primitive.listTargets().forEach((target, index) => {
        if (!keepIndices.includes(index)) target.dispose();
      });
    }
    extras['targetNames'] = keepIndices.map((i) => names[i]);
    mesh.setExtras(extras);
    const weights = mesh.getWeights();
    if (weights.length > 0) mesh.setWeights(keepIndices.map((i) => weights[i] ?? 0));
  }

  await io.write(outPath, document);
}

async function main(): Promise<void> {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: pnpm prepare-avatar <input.vrm|glb> <output.glb>');
    process.exit(1);
  }

  const workDir = mkdtempSync(join(tmpdir(), 'netra-avatar-'));
  try {
    const resized = join(workDir, '1-resized.glb');
    const webp = join(workDir, '2-webp.glb');
    const pruned = join(workDir, '3-pruned-morphs.glb');
    const cleaned = join(workDir, '4-pruned.glb');

    console.log('① resize textures to ≤1024');
    gltfTransform(['resize', '--width', '1024', '--height', '1024', input, resized]);
    console.log('② convert textures to WebP');
    gltfTransform(['webp', resized, webp]);
    console.log('③ strip morph targets the avatar layer never drives');
    await pruneMorphTargets(webp, pruned);
    console.log('④ prune unused resources');
    gltfTransform(['prune', pruned, cleaned]);
    console.log('⑤ Draco compression');
    gltfTransform(['draco', cleaned, output]);
    console.log(`\nWritten ${output}`);
    console.log(`Now run the gate: pnpm inspect-glb ${output}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error('prepare-avatar failed:', error);
  process.exit(1);
});
