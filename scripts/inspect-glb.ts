/**
 * A1 gate validator (PROJECT_PLAN.md §5.1). Dumps a GLB's mesh names, morph
 * target ("blend shape") names, animation clip names, triangle count, and
 * file size — everything needed to check the asset against the A1 gate:
 * at least the 15 Oculus visemes (or ARKit equivalents) plus eye-blink
 * shapes. Run with: `pnpm inspect-glb <path-to.glb>`
 */
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const OCULUS_VISEMES = [
  'viseme_sil',
  'viseme_PP',
  'viseme_FF',
  'viseme_TH',
  'viseme_DD',
  'viseme_kk',
  'viseme_CH',
  'viseme_SS',
  'viseme_nn',
  'viseme_RR',
  'viseme_aa',
  'viseme_E',
  'viseme_I',
  'viseme_O',
  'viseme_U',
];

const ARKIT_VISEME_HINTS = [
  'jawOpen',
  'mouthFunnel',
  'mouthPucker',
  'mouthClose',
  'mouthShrugUpper',
  'mouthShrugLower',
];

const EYE_BLINK_HINTS = ['eyeBlinkLeft', 'eyeBlinkRight', 'eyesClosed', 'eyeBlink'];

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: pnpm inspect-glb <path-to.glb>');
    process.exit(1);
  }

  const fileSize = statSync(filePath).size;
  // Draco decoder registered so the gate can re-validate *compressed* output —
  // compression can silently corrupt morph targets (AVATAR_DESIGN_SPEC §2.5).
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const document = await io.read(filePath);
  const root = document.getRoot();

  console.log(`File: ${filePath}`);
  console.log(`Size: ${formatBytes(fileSize)}\n`);

  let triangleCount = 0;
  const allMorphTargetNames = new Set<string>();

  console.log('Meshes:');
  for (const mesh of root.listMeshes()) {
    const extras = mesh.getExtras() as Record<string, unknown>;
    const targetNames = Array.isArray(extras['targetNames'])
      ? (extras['targetNames'] as unknown[]).map(String)
      : [];
    for (const name of targetNames) allMorphTargetNames.add(name);

    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      const vertexCount = indices ? indices.getCount() : (position?.getCount() ?? 0);
      // mode 4 = TRIANGLES, the glTF default.
      if (primitive.getMode() === 4) {
        triangleCount += Math.floor(vertexCount / 3);
      }
    }

    console.log(`  - ${mesh.getName() || '(unnamed)'} (${targetNames.length} morph targets)`);
  }

  console.log('\nMorph target names found:');
  const sortedTargets = [...allMorphTargetNames].sort();
  if (sortedTargets.length === 0) {
    console.log('  (none)');
  } else {
    for (const name of sortedTargets) console.log(`  - ${name}`);
  }

  console.log('\nAnimation clips:');
  const animations = root.listAnimations();
  if (animations.length === 0) {
    console.log('  (none)');
  } else {
    for (const anim of animations) console.log(`  - ${anim.getName() || '(unnamed)'}`);
  }

  console.log(`\nTriangle count: ${triangleCount.toLocaleString()}`);

  // --- A1 gate check ---
  const missingOculusVisemes = OCULUS_VISEMES.filter((v) => !allMorphTargetNames.has(v));
  const hasFullOculusSet = missingOculusVisemes.length === 0;
  const arkitHintsFound = ARKIT_VISEME_HINTS.filter((v) => allMorphTargetNames.has(v));
  const hasArkitHints = arkitHintsFound.length > 0;
  const eyeBlinkFound = EYE_BLINK_HINTS.filter((v) => allMorphTargetNames.has(v));

  console.log('\n--- A1 gate check (PROJECT_PLAN.md §5.1) ---');
  if (hasFullOculusSet) {
    console.log('✅ All 15 Oculus viseme shapes present.');
  } else if (hasArkitHints) {
    console.log(
      `⚠️  Oculus viseme set incomplete (missing: ${missingOculusVisemes.join(', ')}), ` +
        `but ARKit-style shapes found (${arkitHintsFound.join(', ')}) — may satisfy the ` +
        `"ARKit equivalents" clause. Needs a second visemeMap for ARKit names (§7).`,
    );
  } else {
    console.log(
      `❌ Neither the full Oculus viseme set nor ARKit equivalents were found. ` +
        `Missing Oculus shapes: ${missingOculusVisemes.join(', ')}.`,
    );
  }

  if (eyeBlinkFound.length > 0) {
    console.log(`✅ Eye-blink shape(s) present: ${eyeBlinkFound.join(', ')}.`);
  } else {
    console.log('❌ No eye-blink shape found (expected eyeBlinkLeft/eyeBlinkRight or equivalent).');
  }

  const triangleBudgetOk = triangleCount <= 60_000;
  console.log(
    `${triangleBudgetOk ? '✅' : '❌'} Triangle budget: ${triangleCount.toLocaleString()} / 60,000 max.`,
  );

  const sizeBudgetOk = fileSize <= 8 * 1024 * 1024;
  console.log(
    `${sizeBudgetOk ? '✅' : '⚠️ '} File size: ${formatBytes(fileSize)} / 8 MB budget ` +
      `(budget assumes Draco compression — not yet applied here).`,
  );

  const gatePass = (hasFullOculusSet || hasArkitHints) && eyeBlinkFound.length > 0;
  console.log(`\nGate result: ${gatePass ? 'PASS' : 'FAIL'}`);
  process.exit(gatePass ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('inspect-glb failed:', error);
  process.exit(1);
});
