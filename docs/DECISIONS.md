# Decisions

Architecture decision records. Append-only; if a decision is reversed, add a new entry that supersedes the old one rather than editing it away.

---

## ADR-001: Project renamed Vaani → Netra

**Date:** 2026-08-20
**Status:** Accepted

The project was renamed from "Vaani" (वाणी — speech/voice) to "Netra" (नेत्र — eye) at the owner's request, before any code existed. All docs, the `netra_ro` DB role, `@netra/contracts` package scope, and `NETRA_*` env var names use the new name. No functional impact — this was a pure rename with no code to migrate.

---

## ADR-002: Seed dataset is a synthetic retail-banking (BFSI) schema, generated locally

**Date:** 2026-08-20
**Status:** Accepted

PROJECT_PLAN.md §4.2 (P0.7) left the seed dataset open ("Olist e-commerce or Northwind"). We chose instead to generate a synthetic **retail banking / core-banking** schema (`branches`, `employees`, `customers`, `products`, `accounts`, `cards`, `loans`, `loan_payments`, `transactions`) locally via `scripts/generate-seed-data.ts`, seeded deterministically with `@faker-js/faker`.

**Why:** the project owner's domain background is BFSI/fintech, and this is the demo dataset a non-technical banking user will recognize as "their own data" — better for the product's core pitch than a generic e-commerce sample. Generating it locally (rather than downloading Olist from Kaggle) avoids an external auth/download dependency in CI and guarantees exact row counts (`transactions` clears the ≥10k-row fact-table bar deterministically).

**Trade-off accepted:** less "messy" than real-world data; if realism becomes important later, Olist or a real anonymized BFSI dataset remains an option — swap `db/init/02-schema.sql` and re-run `pnpm seed:generate`.

---

## ADR-003: `@netra/contracts` is types-only — no build step

**Date:** 2026-08-20
**Status:** Accepted

`packages/contracts` exports only TypeScript `interface`/`type` declarations (`SpeechPacket`, `VisemeFrame`, `GestureId`, `Emotion`) — no runtime values. Its `package.json` points `types`/`exports` straight at `./src/index.ts` rather than a compiled `dist/`, and `build` is a no-op.

**Why:** with `import type` (enforced by `isolatedModules`/`verbatimModuleSyntax`), these imports are erased entirely before bundling or emission — no bundler or Node `require`/`import` call is ever produced. A build step would only add topological-ordering risk (typecheck running before contracts is built) for zero benefit. If contracts ever needs runtime code (helpers, validators), revisit this and add a real build.

---

## ADR-004: `apps/api` uses CommonJS, not ESM

**Date:** 2026-08-20
**Status:** Accepted

NestJS 11 is generated as a CommonJS project (`tsconfig.json` targets `NodeNext` with no `"type": "module"` in `package.json`), while `apps/web` and `packages/contracts` are ESM.

**Why:** ESM + `emitDecoratorMetadata` + NestJS's decorator-heavy DI has known friction (relative imports need explicit `.js` extensions under `NodeNext` ESM mode, some decorator-metadata edge cases). NestJS's own default template is still CommonJS. Since `@netra/contracts` is consumed only via type-only imports (ADR-003), the module-format mismatch between packages is a non-issue at runtime.

---

## ADR-005: `db/init/01-readonly-role.sql` is applied via a `.sh` wrapper

**Date:** 2026-08-20
**Status:** Accepted

PROJECT_PLAN.md §4.3 specifies the read-only role SQL using a `psql` variable (`PASSWORD :'ro_password'`). The official Postgres Docker image's `docker-entrypoint-initdb.d` mechanism runs `.sql` files with plain `psql -f` and no way to pass `-v`. `01-readonly-role.sql` is kept byte-for-byte as specified (and mounted outside `docker-entrypoint-initdb.d` so it isn't auto-executed a second time); `00-readonly-role.sh` runs first and invokes it with `-v ro_password="$NETRA_RO_PASSWORD"`, read from the container environment (sourced from `.env`, never committed).

---

## ADR-006: A1 avatar asset (`brunette.glb`) is CC BY-NC 4.0 — non-commercial only

**Date:** 2026-08-20
**Status:** Accepted, with a required follow-up before commercial launch

For the A1 spike we used the TalkingHead.js sample avatar `brunette.glb`, sourced from Ready Player Me and licensed **CC BY-NC 4.0** (non-commercial use only) — see `docs/ASSET_NOTES.md`. This was a deliberate choice, confirmed with the project owner, not an oversight: PROJECT_PLAN.md §5.1 already frames Option A as a throwaway spike asset ("swap for a custom model later"), and this asset was independently verified to carry the full Oculus viseme set, eye-blink shapes, a Mixamo-compatible rig, and to sit comfortably within the triangle/size budget — de-risking the rest of Phase A immediately.

**Why not the CC0 alternative:** `mpfb.glb` (also bundled with TalkingHead.js) is CC0/fully commercial-safe, but at 36.8 MB uncompressed it's far outside budget, and its viseme blendshapes were not yet verified — using it first risked failing the A1 gate and losing a validation cycle for no guaranteed benefit.

**Follow-up required, tracked here:** this asset must be replaced with a commercially-licensed or custom-authored one (Option B/C, or a licensed Ready Player Me subscription, or Microsoft RocketBox re-rigged via Mixamo — MIT licensed, ships ARKit+Oculus shapes) before Phase 7 (deploy) or any commercial use. Do not let this slide unaddressed — check `docs/ASSET_NOTES.md` before shipping.

---

## ADR-007: React 19 kept — `@react-three/fiber` v9 supports it natively

**Date:** 2026-08-20
**Status:** Accepted — resolves PROJECT_PLAN.md open question #1

`@react-three/fiber` 9.7.0's own `peerDependencies` declare `"react": ">=19 <19.3"` and `"react-dom": ">=19 <19.3"`; `@react-three/drei` 10.7.8 requires `"react": "^19"` and `"@react-three/fiber": "^9.0.0"`. `apps/web` is on React 19.2.8, inside both ranges. Installed with no peer-dependency warnings. **No downgrade to React 18 needed** — R3F v9+ is the version line built for React 19.

Confirmed empirically in A2: `AvatarStage.tsx` (Canvas, PerspectiveCamera, OrbitControls, Suspense, useGLTF) renders correctly under React 19.2.8 with no console errors, verified via a headless-Chromium screenshot pass.

**Watch this:** the peer range has an upper bound (`<19.3`). If a future `pnpm install` bumps React past 19.3.0, R3F will need a matching major bump too — don't let `react` drift ahead of `@react-three/fiber`'s supported range unintentionally.

---

## ADR-008: A3 fixture audio generated locally with macOS `say`, viseme timing hand-approximated

**Date:** 2026-08-20
**Status:** Accepted

`public/fixtures/greeting.en.m4a` was synthesized with the local macOS `say` command (voice: Samantha) and converted to AAC/m4a with `afconvert` — not Azure Speech. `AZURE_SPEECH_KEY` isn't configured yet (that's A6), and PROJECT_PLAN.md §5.1 explicitly calls for A3 fixtures to be **hand-authored**, not pulled from a live TTS call. This kept the fixture free, offline, and reproducible.

**The viseme timeline in `greeting.en.json` is a hand-approximated phoneme timing**, not derived from real forced-alignment or Azure's actual viseme event stream — durations and offsets were estimated per-word from the audio's total length (4.65s), not measured. This is sufficient for A3's gate ("the avatar's mouth visibly and plausibly matches the audio," confirmed by screenshot sampling during playback) but is **not** representative of real viseme timing accuracy or of what Azure's `visemeReceived` events will actually look like.

**Follow-up:** when A6 (live TTS integration) replaces fixtures with real `POST /speech/synthesize` calls, this hand-authored timeline is superseded entirely by Azure's real viseme stream — no migration needed, just stop using the fixture. If more fixtures are hand-authored before then, keep them similarly approximate; don't over-invest in precision that gets thrown away at A6.

---

## ADR-009: Coarticulation dominance implemented as specifier/non-specifier pull, with a floor

**Date:** 2026-08-20
**Status:** Accepted

AVATAR_DESIGN_SPEC.md §4.4's blend formula puts `dominance(c)` in both numerator and denominator — read literally it cancels out, and the per-channel dominance table would have no effect. The engine (`apps/web/src/avatar/lipsync/engine.ts`) implements the evident *intent* instead: for channel *c*, a viseme whose recipe **specifies** *c* contributes with weight `dominance(c) · gaussian`, while a neighbouring viseme that does **not** specify *c* pulls the channel toward zero with the complementary weight `max(dominanceFloor, 1 − dominance(c)) · gaussian`.

**Why:** this makes the table behave as its rationale column describes — `mouthClose` (dominance 1.0) is barely diluted by neighbours, `mouthStretch*` (0.5) is easily overridden. The `dominanceFloor` (default 0.15, leva-tunable) exists because at dominance 1.0 the complementary pull is zero, which would let a bilabial's `mouthClose` smear across the entire ±120ms window; the floor lets neighbours decay it while §4.5's explicit closure enforcement still guarantees a full seal across the middle 60% of the bilabial.

Also decided here: the coarticulation gaussian measures distance from the viseme's **span** (onset→end), not its onset point, so long holds (Hindi long vowels, §4.9) keep full influence for their whole duration.

**Verified:** engine-level versions of §4.10's pause test (mouthClose ≥ 0.9, jawOpen ≤ 0.03 across bilabial cores), rounding test (pucker sustains ≥ 0.41 across a U-O-U sequence), and frame-rate test (60fps vs 30fps outputs differ < 0.002) all pass.

---

## ADR-010: Bilabial closure targets tuned down for `brunette.glb`

**Date:** 2026-08-20
**Status:** Accepted

The spec's §4.2/§4.5 starting values (`mouthClose` 1.0 + `mouthPress*` 0.45 + `mouthRollLower` 0.15, enforcement floor 0.9) visibly crumple this asset's lips — the geometry interpenetrates past lip contact, confirmed by frozen-frame screenshots on the "m" of "I'm" and "me". Viseme 21's recipe is now `mouthClose` 0.75 + `mouthPress*` 0.15, and the §4.5 enforcement floors are tunable engine fields (`bilabialMouthClose` 0.75, `bilabialJawOpenMax` 0.03, `labiodentalRollLower` 0.25) exposed in the leva "Lipsync · Closure" folder.

**Why:** ARKit blendshape amplitudes are calibrated per asset; this model reaches full lip seal well below weight 1.0. The pause test's criterion is *visual* ("lips visibly sealed"), which 0.75 satisfies without deformation. **When the model is swapped (A6/A7), re-tune these three values first** — a better-calibrated asset likely wants them back near the spec's 0.9/1.0.

---

## ADR-011: Style register changed to anime (AVATAR_DESIGN_SPEC-2); interim asset is the hinzka 52-blendshape VRoid base

**Date:** 2026-08-20
**Status:** Accepted — supersedes the semi-realistic register in AVATAR_DESIGN_SPEC.md and the ADR-006 asset

The avatar spec was revised (`AVATAR_DESIGN_SPEC-2.md`): the character is now **anime-stylised** (VRoid Studio + Perfect Sync production path) rather than semi-realistic. Part 4 (the lip-sync engine) is unchanged between the two specs, and the engine ran on the new asset without modification.

**Interim asset:** `apps/web/public/models/netra.glb`, built from `VRoid_V110_Female_v1.1.3.vrm` in [hinzka/52blendshapes-for-VRoid-face](https://github.com/hinzka/52blendshapes-for-VRoid-face) — the spec's §3.3 route 3 (ready-made VRoid base with the full ARKit 52 already transferred). Pipeline (`pnpm prepare-avatar`): textures → 1024/WebP, morph targets pruned 124 → 58 (ARKit 52 + six `Fcl_ALL_*` emotion presets kept for `SpeechPacket.emotion` later), Draco. Result: 3.84 MB, 32.9k triangles, `inspect-glb` gate PASS **after** compression.

**Licensing caveat:** hinzka's terms are informal ("feel free to use as source data"); the base is a modified official VRoid sample. Same status as ADR-006 — fine for development, replace before anything public. The plan is that this base is *also the Perfect Sync donor*: the styled character (Part 1 brief — bob shape is already close; hair colour, blazer, palette pending) gets built in VRoid Studio, exported as VRM 0.0 (with "Reduce Polygons" and "Delete Transparent Meshes" UNCHECKED — §3.3), shapes transferred from this donor, then `pnpm prepare-avatar` + `pnpm inspect-glb`.

**Loader decisions (per §3.4):** loaded as plain glTF via `useGLTF`, not `@pixiv/three-vrm` — the avatar layer stays format-agnostic and drives `morphTargetInfluences` directly. VRM 0.0 faces −Z, so `AvatarModel` rotates the scene 180°. Draco decoder is self-hosted at `public/draco/` (no CDN). Eye bones use VRoid naming (`J_Adj_L_FaceEye`); the binding matcher covers both conventions. A static arms-at-rest pose is applied in code because the asset ships in T-pose — superseded when A4 gesture clips land.

**Known debts:** 14 materials vs the ≤6 draw-call budget (defer to a material-merge pass or the styled rebuild); KHR_materials_unlit flat shading rather than §2.6's toon ramp (acceptable for the anime register at this stage; revisit with MeshToonMaterial if depth is wanted); bilabial closure floors (ADR-010) verified good on this asset without re-tuning.

---

## ADR-012: Perfect Sync done headlessly — UV-matched blendshape transfer, no Blender

**Date:** 2026-08-20
**Status:** Accepted — the styled character (`Netra-anime.vrm`) replaces the ADR-011 interim base

The user-designed character was built in VRoid Studio 2.14 (`anime-1.vroid`) and exported as `Netra-anime.vrm` (VRM 1.0). Raw VRoid exports carry no ARKit shapes (56 `Fcl_*` + 15 `VRC.v_*` visemes only), and the spec's §3.3 Perfect Sync routes all assume Blender or Windows tooling. Instead, `pnpm transfer-blendshapes` (new, `scripts/transfer-blendshapes.ts`) copies the 52 ARKit morph targets from the hinzka donor directly in gltf-transform.

**How it works:** official VRoid faces share topology, but the two exporters bucket vertices differently (donor: 9 primitives sharing one 4709-vertex buffer; VRoid 2.14: 8 material-split primitives totalling 4709). Vertex correspondence is recovered by **UV matching** — face UVs are invariant under face-shape sliders while positions are not. Verified 100% (4709/4709) match; the script hard-fails below 99% so a topology-breaking export (polygon reduction, transparent-mesh deletion) cannot slip through. The donor VRM is not committed — it auto-downloads to `scripts/.cache/` (gitignored) on first use.

**Result:** `Netra-anime.vrm` → transfer → `prepare-avatar` → 3.63 MB, 55.4k triangles, gate PASS, bilabial seal verified on frozen frames. VRM 1.0 faces +Z per glTF convention, so the ADR-011 180° rotation was removed and the T-pose arm-rest signs flipped (`AvatarModel.tsx`).

**Re-export loop is now:** VRoid Studio → export VRM (no reduction options) → `pnpm transfer-blendshapes in.vrm mid.glb` → `pnpm prepare-avatar mid.glb apps/web/public/models/netra.glb` → `pnpm inspect-glb` → refresh. No code changes per restyle.

**Caveats:** eyeLook/blink deltas transfer with the neutral donor's eye geometry — if the styled face's eyes moved far from the base, blinks may need visual re-checking after big face edits. Hair in the current design falls along the cheeks, close to the §1.2 jawline-clearance line — watch the mute test.

---

## ADR-013: Avatar assets are a registry with a dev switcher, not a constant

**Date:** 2026-08-20
**Status:** Accepted

`AvatarModel` hard-coded a single `MODEL_PATH`. It now takes an `AvatarAsset` from a registry (`apps/web/src/avatar/avatarAssets.ts`), selected through a dev-only leva control. Two assets are registered: the VRoid character (default) and an Avaturn export kept as the semi-realistic option. See `docs/ASSET_NOTES.md` for the comparison table and licences.

**Why:** AVATAR_DESIGN_SPEC-2 §3.6 says that if swapping the asset is painful, the architecture is wrong — and that this should be found out now, not at A6/A7. A registry turns that from an assertion into something exercised on every dev session. Swapping between the two assets required **zero changes to the lip-sync layer**, which is the check §3.6 actually asks for.

**What the registry carries per asset:** model path, Y rotation to face the camera (VRM 0.0 faces −Z, VRM 1.0 and glTF face +Z), a rest-pose rotation list (assets ship in T-pose; gesture clips land in A4), and `hiddenMeshes`. Pose and visibility changes are applied through a returned undo closure — the scene is a shared `useGLTF` cache entry, so a remount would otherwise stack rotations. Verified stable across repeated round-trip switches (identical bone values every pass).

**Rig-convention finding worth keeping:** VRoid and Mixamo-named rigs do not merely differ in sign. On the Avaturn rig each arm bone's local Z runs down the limb, so rotating Z *twists* the arm and **X** is the swing axis — and because both arm bones share that local orientation, both lower with the *same* sign, not mirrored ones. Determined empirically by driving the live scene through a dev `window.__netraScene` handle rather than by guessing; that handle is `import.meta.env.DEV`-gated alongside the existing `__netraAudio`.

**Bundle note:** only the default asset is preloaded. The alternates are several MB each and load on demand when the switcher selects them, so the registry costs nothing at runtime for users.

---

## ADR-014: Asset calibration moves to `channelGains`; tongue gets an explicit restore strength

**Date:** 2026-08-20
**Status:** Accepted — supersedes ADR-010

User testing on the Avaturn asset surfaced three lip-sync defects that shared one root cause: **asset-specific calibration had been baked into the spec-level logic.** ADR-010 detuned viseme 21's recipe and the §4.5 enforcement floor to 0.75 because the VRoid face crumpled at 1.0. Those values then travelled to an asset that needed the spec's 0.9, and its bilabials stopped sealing.

**Fix:** recipes and enforcement return to spec-faithful values (`mouthClose` 1.0 in the recipe, 0.9 enforcement floor). A new per-asset `channelGains` map in the registry scales engine output *after* enforcement, so "this model's lips seal at 0.8" lives with the model. The VRoid asset carries `mouthClose: 0.8, mouthPress*: 0.35, mouthRollLower: 0.6`; Avaturn carries `tongueOut: 0.3`. Verified numerically at the true bilabial centre: `mouthClose` 0.900, `jawOpen` 0.016 (≤ 0.03), on Avaturn.

**Visible tongue — a real engine bug, not just an asset quirk.** `tongueOut` has dominance 0.9, and the restore strength was derived as `max(dominanceFloor, 1 − dominance)` = 0.15. So once the tongue came out for a TH, neighbouring visemes could barely pull it back and it hung out across the window. Invisible on VRoid (teeth and tongue are fused into the face mesh) and unmistakable on Avaturn, which has a real `Tongue_Mesh`. Dominance ("wins when required") and restore ("returns when not required") are now separable: `CHANNEL_RESTORE_OVERRIDE` sets `tongueOut: 1.0`. Measured `tongueOut` after the fix: 0.001–0.019 across the fixture, versus 0.22 recipe peaks before.

**Note for future assets:** any model with separate teeth/tongue meshes will expose this class of bug that a fused-face model hides. Re-run the §4.10 protocol per asset, not once.

---

## ADR-015: Procedural gesture motion — tried, then removed

**Date:** 2026-08-20 (removed 2026-08-21)
**Status:** Rejected. The code is deleted; the rig findings below are the part worth keeping.

The user asked for hand movement on both models. Real A4 gestures mean sourcing Mixamo clips and retargeting them to two rigs with incompatible bone naming (VRoid `J_Bip_*` vs Mixamo `LeftArm`), plus stripping facial tracks — a substantial task with an asset pipeline attached.

`useGestureMotion` instead drives arm, forearm and hand bones procedurally from two out-of-phase sine terms (idle sway) plus a term scaled by the **same RMS envelope that drives the lips**, so emphasis lands with the voice rather than on an independent clock. Per-asset bone/axis/amplitude config lives in the registry next to the rest pose, because the rigs disagree about which local axis swings a limb.

**Why this rather than waiting for A4:** it needs no animation assets, works on any rig the registry can describe, and makes the "is she alive?" question answerable now. It is explicitly a bridge — when A4 lands with authored clips, this layer should be replaced, not extended.

**Kept deliberately small.** The failure mode of procedural motion is looking like a metronome, so amplitudes are a few degrees and the two oscillators use incommensurate rates so the cycle never visibly repeats. A leva "Gesture" folder exposes `idleScale`/`speechScale` for tuning by eye (§4.11), since the right amount of gesture is a judgement call.

**Binding order matters:** gesture bases are captured in an effect, not a `useMemo`, so they include the asset's rest pose (which is applied in an earlier effect). Capturing during render would bake in the T-pose. Bases are restored on unmount because the scene is a shared `useGLTF` cache entry.

### Outcome: removed (2026-08-21)

The user's verdict on seeing it move was "the hand movement is too off", with instructions to remove it if it could not be fixed. Two real defects were found and fixed first — the wrist was being rotated on an axis that deviates it sideways rather than flexing it (a visibly broken hand), and the elbow was being flexed on the wrong axis entirely (`x` instead of `z` on the Mixamo rig). Both came from **guessing axes by analogy** after only the shoulder axis had been verified empirically.

It was still removed. Two reasons:

1. **The wrist cannot be faked this way at all.** On both rigs it deviates sideways on every axis tried, so any rotation offset reads as a broken hand. Removing the wrist leaves shoulder and elbow sway, which is arm motion, not the hand movement that was asked for.
2. **Verification was not possible at the fidelity the problem needed.** Motion quality is a judgement made on moving footage; stills could confirm the axes were now correct but not that the result read as natural. Iterating further on something already rejected once, without being able to check the thing being judged, was not a good trade.

`useGestureMotion.ts` is deleted, along with `gestureBones` in the registry and the `RmsEnvelope.normalised` accessor added for it. **A4 should do this properly** — authored clips retargeted to the rig — rather than resurrect this.

**Kept:** the rig axis conventions, documented in `avatarAssets.ts` next to the rest poses. Deriving them meant driving each bone on the live scene and looking at the result, and A4 will need exactly this table.

---

## ADR-016: A6 speech API — Azure SDK over REST, inline base64 audio, fixture mode as a cache-only mode

**Date:** 2026-08-21
**Status:** Accepted

`POST /speech/synthesize` and `GET /speech/usage` land in `apps/api/src/speech/`. Four decisions a future reader would otherwise have to re-derive:

**1. The Azure Speech SDK, not the REST TTS endpoint.** The REST endpoint returns audio and nothing else; `visemeReceived` is an SDK-only event stream. Since the viseme timeline is the entire reason Azure was chosen over better-sounding providers (PROJECT_PLAN.md §5.3), the SDK dependency (`microsoft-cognitiveservices-speech-sdk`, ~18 transitive packages, `apps/api` only) is not optional. Synthesis is driven through SSML rather than `speakTextAsync` so language and voice are stated explicitly, with `<mstts:viseme type="redlips_front"/>` requesting the numeric viseme IDs — `type="FacialExpression"` would return blend-shape JSON instead, which is not what the frozen contract carries.

**2. Audio is returned as `audioBase64`, not `audioUrl`.** The contract permits either. Inline base64 avoids a second endpoint, a static file route, and absolute-URL construction across origins, at the cost of ~33% payload inflation. At 24kHz/48kbit mono MP3 a Phase-A sentence is tens of kilobytes, so this is free. **Revisit when replies get long** — Phase 3's narrated reports are the likely trigger; switching means writing the cached audio to a file and serving it, with no change to the contract or the avatar.

**3. `NETRA_TTS_MODE=fixture` is a cache-only mode, not a fixtures-only mode.** It serves hand-authored packets from `apps/api/fixtures/speech/` *and* anything already in the synthesis cache, and reaches the network never. This makes it strictly more useful than a fixtures-only mode — a sentence synthesised once stays playable offline forever — without weakening the guarantee that matters, which is about network calls rather than about provenance. A miss returns 503 naming the sentence, listing what fixtures exist, and stating both ways forward. `apps/api/fixtures/speech/greeting.en.json` is the A3 greeting (ADR-008) with its audio inlined, so fixture mode has something real to serve out of the box.

Fixture lookup falls back from the exact language tag to the same language in any region (`en-IN` reaches an `en-US` recording). Without it the product's own default language dead-ends on first contact: the UI defaults to `en-IN`, the only shipped fixture is `en-US`, so a user typing the fixture sentence exactly still fails. The returned packet keeps the `lang` it was recorded under, so nothing misrepresents the audio, and the fallback never crosses languages — `hi-IN` still 503s rather than quietly answering in English. Found by the parallel session's browser click-through, not by any test I wrote.

Voice resolution deliberately happens *after* the fixture lookup: fixture matching is voice-agnostic (`fixtureKey` is text+lang only), so resolving eagerly made a fixture in a language with no registered default voice unreachable behind a 400. Caught by curl, not by the type checker.

**4. The `SpeechPacket` zod schema lives in `apps/api`, mirrored from the contract.** `packages/contracts` stays types-only (ADR-003). The mirror in `speech-packet.schema.ts` ends in a `transform` annotated `: SpeechPacket`, which is the drift guard — add a required field to the contract and this stops compiling. The transform also re-attaches the optional audio keys only when they hold a value, because `exactOptionalPropertyTypes` makes zod's `.optional()` (`string | undefined`) unassignable to the contract's `audioBase64?: string`. Outgoing packets are validated, not just incoming requests: this endpoint is the first producer of the frozen contract, and a violation should fail here rather than as a mystery in the render loop.

**Cost discipline, as CLAUDE.md requires.** Every synthesis is cached to `NETRA_TTS_CACHE_DIR` (default `.cache/tts`, gitignored) under `hash(text + lang + voice)` — NUL-separated so a field-boundary shift cannot collide, whitespace-normalised so reformatting does not re-bill. Only real syntheses increment the daily spend counter; cache hits and fixtures do not. The counter is UTC-dated and serialised through a promise chain so concurrent requests cannot lose a count.

**Two things that are code-complete but unverified, and must not be mistaken for verified:**

- **No live Azure call has ever been made.** `AZURE_SPEECH_KEY` is empty in `.env`. The fixture path, the cache path, validation, CORS, and the live-mode startup guard are all verified end-to-end with curl; the Azure call itself is verified only against a fake. The first real key will be the first real test, and A6's gate (three languages, correct lip-sync) is not met until then.
- **The default voice names in `voices.ts` are unverified.** They follow Azure's naming convention but were not checked against a live account's voice list. A wrong name fails inside the SDK with a message that reads like a network error, so check the region's voice list before trusting one (`GET https://<region>.tts.speech.microsoft.com/cognitiveservices/voices/list` with the `Ocp-Apim-Subscription-Key` header). An unrecognised language returns a 400 asking for an explicit `voice` rather than guessing.
- `NETRA_TTS_USD_PER_MILLION_CHARS` defaults to 16 — a list price from memory, not a quote. It is configurable because prices change; verify it before the number matters.

---

## ADR-017: Azure viseme coverage is per-locale, not universal — and a silence-only timeline is normalised to empty

**Date:** 2026-08-21
**Status:** Accepted — partially answers PROJECT_PLAN.md open question #6

First live Azure synthesis (`centralindia`, F0 tier). Credentials, all eleven voice names in `voices.ts`, and the viseme event stream all verified by `pnpm verify-speech`.

**The finding.** PROJECT_PLAN.md §3.4 justifies choosing Azure on the basis that it "emits timestamped viseme events across 100+ languages". Measured, that is not true per-locale. Of ten Indian-language locales tested with a comparable sentence:

| Emits visemes | Audio only, no visemes |
|---|---|
| en-IN, en-US, en-GB, hi-IN, ta-IN, mr-IN, te-IN, gu-IN | **bn-IN** (both `TanishaaNeural` and `BashkarNeural`), **kn-IN**, **ml-IN** |

The audio-only locales accept the SSML, return correct audio, and raise no error — they simply never fire `visemeReceived`. Nothing in the API surface distinguishes them, which is why this was invisible until measured.

**Consequence for the product:** Bengali, Kannada and Malayalam get amplitude-driven jaw motion, not phoneme-driven lip-sync — the fallback PROJECT_PLAN.md §5.1 A3 calls "visibly worse… a fallback, never the primary path". They remain usable; they are not demo languages. Hindi and Tamil, the two named in A6's gate alongside English, both work fully.

**The bug this exposed.** Those locales return not an empty timeline but a single silence frame, `[{timeMs: 50, visemeId: 0}]`. The avatar engages its amplitude fallback only when `visemes.length === 0` (`useLipsync.ts`), so a one-frame timeline slipped past that check and held viseme 0 for the entire utterance — **a completely frozen mouth over several seconds of audio, strictly worse than having no viseme data at all.**

Fixed in `normaliseVisemeTimeline`: a timeline containing no frame other than silence is emitted as `[]`, which is the contract's documented signal for "fall back to amplitude". Fixed in the API rather than the avatar deliberately — the frozen contract already defines the empty-timeline meaning, so the producer should honour it and every consumer benefits without change. Regression tests cover both the silence-only case and the "has any real articulation" case.

**Not encoded as a capability table.** Azure adds viseme support to locales over time, so a hardcoded list of unsupported languages would go stale silently. `AzureTtsService` already warns whenever a response carries no visemes, which self-corrects. The measured list lives as a dated comment in `voices.ts`.

**Cost note:** the whole exercise — credential probe, eleven voice checks, and ~24 syntheses across ten languages — came to 916 characters, about $0.015 against a 500,000-character monthly free tier. The cache did its job: repeating a sentence did not re-bill.
