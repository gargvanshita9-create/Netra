# Netra — Avatar Design & Lip-Sync Specification

> Companion to `PROJECT_PLAN.md` (Phase A). This document covers the character asset itself and the lip-sync engine that drives it.
> **Part 1** is the design brief — hand this to a modeller, or follow it yourself.
> **Part 2** is the technical asset spec — the acceptance criteria for any candidate model.
> **Part 3** is the production workflow — VRoid Studio + Perfect Sync.
> **Part 4** is the lip-sync engineering spec — this is where "near-perfect" actually comes from.

---

## The core insight before anything else

**Lip-sync quality is roughly 30% asset and 70% blending code.**

A model with a full ARKit blendshape set and a naive viseme player will look worse than a modest model with a properly written coarticulation engine. Most web avatars look wrong for four specific, fixable reasons — hard viseme switching, no anticipatory timing, smeared bilabial closures, and a single global smoothing constant applied to sounds with wildly different articulation speeds. Part 4 addresses each.

So: get an adequate asset, then spend your time on Part 4.

---

# PART 1 — Character design brief

## 1.1 Character concept

**Role:** a senior data analyst who explains findings to non-technical colleagues. She is competent, calm, and unhurried. She is not a receptionist, not a mascot, and not a customer-service bot.

| Attribute | Specification |
|---|---|
| Apparent age | 30–38. Old enough to be trusted with analysis; young enough to read as current. |
| Build | Average, naturalistic proportions. No stylised exaggeration of the figure. |
| Height framing | Full body must exist and be riggable, but the default camera frames head-to-mid-torso. |
| Style register | **Anime / stylised.** Clean cel-shaded look, professionally dressed. |

### On the style register — decided

**Direction: anime-stylised, professionally presented.** Not semi-realistic, not photoreal.

This is a deliberate choice with three technical advantages, not a compromise:

1. **It sidesteps the uncanny valley entirely.** Semi-realistic and photoreal characters make every small lip-sync error read as *wrong*; a stylised character makes the same error read as *stylistic*. The style buys forgiveness that no amount of tuning can.
2. **Performance.** Cel shading, lower poly counts and simpler materials mean the 60fps desktop and 30fps mobile budgets stop being tight.
3. **Distinctiveness.** A polished anime analyst in a blazer is more memorable in a portfolio than another generic corporate avatar.

**The tension to manage:** anime style must not read as *unserious*. Resolve it through wardrobe, posture and expression — tailored blazer, upright neutral posture, calm direct gaze, restrained palette. The character is stylised; her presentation is not. Avoid VTuber signifiers: no oversized accessories, no exaggerated proportions, no idol styling.

**Anime style does NOT mean coarse lip-sync.** See §3.2 — the full 52-shape ARKit set is available on VRoid models via Perfect Sync, so Part 4 applies unchanged.

## 1.2 Hair — the bob

A bob is a genuinely good technical choice, not just an aesthetic one: it is short, it sits close to the head, it needs little or no physics simulation, and it costs a fraction of the polygons of long hair.

| Attribute | Specification |
|---|---|
| Cut | Chin-length to jaw-length blunt bob, with soft internal layering to avoid a helmet silhouette. |
| Part | Deep side part or a soft centre part. Side part reads slightly more assertive. |
| Volume | Moderate. Enough body to catch light; not voluminous enough to occlude the jawline. |
| Jawline clearance | **Non-negotiable: hair must not cross the jaw or cheek geometry.** Occluding the jaw destroys lip-sync legibility, which is the entire point of the character. |
| Colour | Deep brown-black or a warm dark brown. Avoid flat pure black — it renders as a silhouette with no readable form. |
| Construction | **Hair cards** (textured planes with alpha), not strand/particle hair. Strand hair will not run at 60fps in a browser. |
| Physics | Optional. A subtle spring-bone on the outer tips only, if the rig supports it. Static hair is acceptable and safer. |

## 1.3 Outfit

| Item | Specification |
|---|---|
| Jacket | Tailored single-breasted blazer, notch lapel, no visible buttons fastened, sleeves full length. |
| Under-layer | Crisp shell top or simple blouse, high-ish neckline. No pattern. |
| Lower | Tailored trousers, straight leg. |
| Footwear | Low block heel or flat. Rarely visible; keep it cheap. |
| Accessories | At most two: small stud earrings, a slim watch. Nothing that dangles or needs simulation. |
| Materials | Matte woven fabric with subtle weave normal map. **No high-gloss, no metallic, no reflective trim** — they blow out under simple real-time lighting. |

### Palette direction

Derive the palette from the product's own subject matter. This is a **data instrument** — the visual vocabulary of measurement, precision and readouts — not a generic corporate assistant.

**Deliberately avoid:** warm cream + serif + terracotta; near-black + acid green; muted sage + rounded-everything. All three are current AI-default looks and will make the project read as templated.

A defensible direction: a deep ink or slate garment, one restrained accent that also appears in your chart palette (so the character and the data feel like one system), and warm neutral skin tones to keep her from reading as cold. The accent colour is the one place to be decisive.

## 1.4 Deliverable: the turnaround sheet

Before any modelling begins, produce a reference sheet. If commissioning, this is what you send. If building yourself, this is what stops you drifting mid-build.

- Front, 3/4 front, side, 3/4 back, back — full body
- Head close-up: front, 3/4, side
- Hair silhouette study, front and side
- Expression sheet: neutral, slight smile, concerned, mouth open (`aa`), mouth pursed (`U`)
- Palette swatches with hex values
- One line stating what she is *not* (e.g. "not a receptionist, not a VTuber, not photoreal")

---

# PART 2 — Technical asset specification

This is the acceptance criteria. Any candidate model — built, downloaded, or commissioned — must satisfy every line. Validate with `scripts/inspect-glb.ts` **before** writing rendering code.

## 2.1 Format and budget

| Requirement | Value |
|---|---|
| Format | `.glb` (glTF 2.0 binary) |
| Triangles | ≤ 60,000 total; ≤ 25,000 in the head |
| Textures | ≤ 2048×2048, Draco/KTX2 compressed |
| File size | ≤ 8 MB compressed |
| Materials | ≤ 6 draw calls. Cel/toon shading — see §2.6. |
| Frame rate | 60fps desktop, ≥ 30fps mid-range mobile |
| Up axis | Y-up, facing +Z, T-pose or A-pose at origin |
| Scale | 1 unit = 1 metre |

## 2.2 Face topology — the part modellers get wrong

Blendshape quality is bounded by edge flow. Specify explicitly:

- **Concentric edge loops around the mouth** (minimum 3), following the orbicularis oris muscle. Without these, lips cannot purse or close cleanly and every `U`, `O` and `PP` viseme will look broken.
- **Concentric loops around the eyes** (minimum 3) for blinks and squints.
- Sufficient density at the nasolabial fold and the jawline.
- **Separate meshes for upper teeth, lower teeth and tongue.** Lower teeth parent to the jaw bone; upper teeth to the skull. A model with teeth fused to the head cannot open its mouth correctly.
- Inner mouth cavity geometry, dark-shaded, so an open mouth is not a hole into the skull.
- Quads throughout; triangulate only at export.

## 2.3 Blendshapes — required set

**Specify ARKit's 52, not Oculus's 15 visemes.** This matters more than it sounds. Oculus visemes are pre-baked whole-mouth poses — you get 15 fixed shapes and can only crossfade between them. ARKit shapes are *articulatory primitives* (jaw, lip corners, lip roll, pucker, funnel, stretch) that you compose. Composition is what makes coarticulation possible, and coarticulation is what makes lip-sync look real.

**Mandatory — mouth and jaw (18):**
`jawOpen`, `jawForward`, `jawLeft`, `jawRight`, `mouthClose`, `mouthFunnel`, `mouthPucker`, `mouthLeft`, `mouthRight`, `mouthSmileLeft`, `mouthSmileRight`, `mouthFrownLeft`, `mouthFrownRight`, `mouthPressLeft`, `mouthPressRight`, `mouthShrugUpper`, `mouthShrugLower`, `mouthRollUpper`, `mouthRollLower`

**Mandatory — lip detail (6):**
`mouthStretchLeft`, `mouthStretchRight`, `mouthDimpleLeft`, `mouthDimpleRight`, `mouthUpperUpLeft`, `mouthUpperUpRight`, `mouthLowerDownLeft`, `mouthLowerDownRight`

**Mandatory — eyes and brows (10):**
`eyeBlinkLeft`, `eyeBlinkRight`, `eyeSquintLeft`, `eyeSquintRight`, `eyeWideLeft`, `eyeWideRight`, `browDownLeft`, `browDownRight`, `browInnerUp`, `browOuterUpLeft`, `browOuterUpRight`

**Strongly recommended:**
`tongueOut` plus tongue tip up/down if available — TH, L, N and D are visibly wrong without a tongue. `cheekPuff`, `cheekSquintLeft/Right`, `noseSneerLeft/Right` for secondary realism.

**Optional convenience:** the 15 Oculus visemes *in addition*, as a fallback path. Never as the primary.

## 2.4 Rig

- Humanoid skeleton, **Mixamo-compatible naming** so the standard animation library retargets without manual work
- Fully rigged arms and hands with individual finger joints — gestures are part of the spec
- Head, neck, and both eye bones separately addressable (eye bones drive gaze; do not fake gaze with textures)
- Jaw bone present and driven by `jawOpen`
- No facial *bones* competing with blendshapes — pick one system for the face and stay in it

## 2.5 Validation gate

`pnpm inspect-glb <path>` must report: all mandatory blendshapes present, teeth and tongue as separate meshes, Mixamo-compatible bone names, within poly and size budget. **After Draco compression, re-run it** — compression can silently corrupt morph targets, and finding that out during A6 costs a day.

---

## 2.6 Shading

VRoid exports MToon-style toon materials. In three.js these map most closely to `MeshToonMaterial`, or a custom shader if you want control over the ramp.

- Keep the ramp to **two or three bands**. More bands drift toward realism and lose the style's uncanny-valley immunity.
- Rim light on the silhouette separates her from the background without extra geometry.
- **No specular on skin.** Toon skin with a specular highlight reads as plastic.
- Outline: inverted-hull or a post-process edge pass. Inverted-hull is cheaper and more predictable; budget it inside the material count.
- Test the palette (§1.3) under the toon ramp before finalising — colours flatten and shift under banded shading, and a palette chosen on a flat swatch often fails here.

---

# PART 3 — Production: VRoid Studio + Perfect Sync

**Chosen path: build it yourself in VRoid Studio, then apply Perfect Sync.** Free, ~1 day total, full art direction, and it yields the complete 52-shape ARKit set.

## 3.1 Why this works

Raw VRoid exports carry only VRM's native expression set (roughly `aa / ih / ou / ee / oh` plus blink) — five mouth shapes, far too coarse for Part 4. **Perfect Sync solves this.**

<cite index="90-1">In late 2020 the Japanese developer hinzka coined "Perfect Sync" for the process of automatically adding the 52 ARKit blendshapes to any VRoid model. It is now widely used in the VTubing community, and "Perfect Sync" is often used interchangeably with "ARKit blendshapes."</cite>

It can be automated because <cite index="85-1">every official VRoid face shares the same mesh topology, so the expression shapes transfer vertex-for-vertex from a donor model with zero manual sculpting.</cite>

Consequence: **Part 4 applies unchanged.** The recipes, dominance blending and bilabial enforcement all assume ARKit primitives, and Perfect Sync delivers exactly those.

## 3.2 Workflow

| Step | Action | Output |
|---|---|---|
| 1 | **Validate the wardrobe first.** Confirm VRoid can produce a blazer — built-in jacket items with texture editing, or a downloaded outfit texture from BOOTH. If it cannot, this whole path fails; stop here. | Go / no-go |
| 2 | Design the character in VRoid Studio per Part 1 — bob, blazer, palette, neutral expression. | `netra.vrm` |
| 3 | Apply Perfect Sync (§3.3). | `netra_ps.vrm` |
| 4 | Retarget Mixamo clips to the VRM humanoid skeleton (`@pixiv/three-vrm` publishes a Mixamo retargeting example). | Animation clips |
| 5 | `pnpm inspect-glb netra_ps.vrm` — **the gate.** | Pass / reject |
| 6 | Compress (Draco/KTX2), then **re-run step 5**. | Shippable asset |

## 3.3 Perfect Sync — three routes

| Route | Requirement | Notes |
|---|---|---|
| **HANA_Tool** | Blender | <cite index="90-1">The community standard for automatically adding ARKit blendshapes to VRoid-made models.</cite> |
| **blender-vrm-perfect-sync** | Windows | <cite index="85-1">Click-to-run tool that batch-copies a finished perfect-sync setup from a donor model via headless Blender — no Blender skills needed. Ready-made neutral donors are included.</cite> |
| **hinzka/52blendshapes-for-VRoid-face** | None | <cite index="92-1">Modified VRoid models with the shapes already added, distributed as VRM, intended as bases for your own avatar.</cite> Start from one of these and the shapes come free. |

### Two export settings that silently break the transfer

<cite index="85-1">Export as **VRM 0.0**, not VRM 1.0. In the export dialog, keep both of these UNCHECKED: "Reduce Polygons" (decimates the mesh and changes face topology) and "Delete Transparent Meshes" (removes face triangles such as eyelashes and eyebrow edges, changing the face vertex count).</cite>

Either setting breaks the vertex-for-vertex transfer, and the failure is silent — you get a model that looks correct and has no working ARKit shapes. `inspect-glb.ts` catches it; noticing before you spend an evening is better.

## 3.4 VRM vs GLB in three.js

VRM is a glTF extension, so a `.vrm` file is a valid GLB container. Two options:

- **`@pixiv/three-vrm`** — handles VRM's humanoid bone mapping, spring bones and expression system. More VRM-idiomatic, extra dependency, and the expression layer sits between you and the raw morph targets.
- **Load as plain glTF** with `useGLTF` and drive `morphTargetInfluences` directly. Simpler, keeps the avatar layer format-agnostic, and matches Part 4 exactly.

**Prefer the second** unless spring-bone hair physics is needed. The avatar layer should not know or care that the asset originated as VRM. Record the decision in `docs/DECISIONS.md`.

Note: `inspect-glb.ts` reads VRM files, but VRM-specific extensions are unregistered — if parsing fails, convert to `.glb` first with `gltf-transform copy`.

## 3.5 Fallbacks, if the wardrobe check fails

| Path | Cost | Notes |
|---|---|---|
| **Commission an anime model with ARKit blendshapes** | ~₹5,000–20,000 | A large, cheap market — VTuber models need ARKit shapes for iPhone face tracking, so modellers do this routinely. <cite index="90-1">Many modellers offer ARKit blendshape addition as a standalone service.</cite> Send Parts 1 and 2 verbatim; make payment conditional on `inspect-glb` passing. |
| **ShapeKeyGen (Blender addon)** | ~$15 | <cite index="91-1">Generates all 52 ARKit blendshapes for a rigged character, working with stylised, cartoon or semi-realistic models.</cite> For non-VRoid base meshes. |
| **Character Creator 4** | Paid licence | The professional tool if you later want a realistic register. <cite index="61-1">ExpressionPlus is its ARKit-based system, adding 63 blendshapes and 7 tongue morph sliders.</cite> |

**Skip:** Ready Player Me (shut down January 2026), MetaHuman (licensing tied to Unreal; web app shutting down November 2026), plain Mixamo characters (rigged body, no facial blendshapes at all).

## 3.6 Do not let this block Phase A

Start today with TalkingHead.js's sample avatar — it already satisfies §2.3, so A1's gate passes immediately and you can build and tune the entire lip-sync engine against a known-good asset. Build Netra in VRoid on a parallel track and swap her in at A6/A7. If the swap is painful, the architecture is wrong; fix that before Phase 1.

---

# PART 4 — Lip-sync engineering specification

This is the part that determines whether it looks near-perfect. Implement in `apps/web/src/avatar/lipsync/`.

## 4.1 Architecture

```
SpeechPacket.visemes (Azure IDs + timestamps)
        ↓  ① viseme → ARKit weight recipe
        ↓  ② anticipatory time shift
        ↓  ③ coarticulation blend (dominance model)
        ↓  ④ bilabial closure enforcement
        ↓  ⑤ class-specific attack/decay
        ↓  ⑥ amplitude modulation from audio RMS
        ↓  ⑦ secondary motion (brow, head, blink)
   morphTargetInfluences
```

## 4.2 ① Viseme recipes

Each Azure viseme maps to a **combination** of ARKit weights, not a single morph. Starting values below — tune by eye during A3, expose via `leva`.

```ts
export const VISEME_RECIPES: Record<number, Partial<ArkitWeights>> = {
  0:  { jawOpen: 0.02 },                                                    // silence
  1:  { jawOpen: 0.45, mouthStretchLeft: 0.12, mouthStretchRight: 0.12 },   // æ ə ʌ
  2:  { jawOpen: 0.62, mouthStretchLeft: 0.08, mouthStretchRight: 0.08 },   // ɑ
  3:  { jawOpen: 0.45, mouthPucker: 0.35, mouthFunnel: 0.42 },              // ɔ
  4:  { jawOpen: 0.32, mouthStretchLeft: 0.28, mouthStretchRight: 0.28 },   // ɛ ʊ
  5:  { jawOpen: 0.28, mouthPucker: 0.18, mouthFunnel: 0.15 },              // ɝ
  6:  { jawOpen: 0.16, mouthSmileLeft: 0.30, mouthSmileRight: 0.30,
        mouthStretchLeft: 0.35, mouthStretchRight: 0.35 },                  // i ɪ j
  7:  { jawOpen: 0.14, mouthPucker: 0.72, mouthFunnel: 0.55 },              // u w
  8:  { jawOpen: 0.40, mouthPucker: 0.42, mouthFunnel: 0.48 },              // o
  9:  { jawOpen: 0.55, mouthPucker: 0.20 },                                 // aʊ
  10: { jawOpen: 0.42, mouthPucker: 0.30, mouthFunnel: 0.30 },              // ɔɪ
  11: { jawOpen: 0.52, mouthStretchLeft: 0.15, mouthStretchRight: 0.15 },   // aɪ
  12: { jawOpen: 0.20 },                                                    // h
  13: { jawOpen: 0.14, mouthPucker: 0.30, mouthFunnel: 0.22 },              // ɹ
  14: { jawOpen: 0.14, tongueOut: 0.06, mouthShrugUpper: 0.12 },            // l
  15: { jawOpen: 0.05, mouthStretchLeft: 0.30, mouthStretchRight: 0.30,
        mouthDimpleLeft: 0.20, mouthDimpleRight: 0.20 },                    // s z
  16: { jawOpen: 0.14, mouthPucker: 0.48, mouthFunnel: 0.40 },              // ʃ tʃ dʒ ʒ
  17: { jawOpen: 0.14, tongueOut: 0.22, mouthLowerDownLeft: 0.18,
        mouthLowerDownRight: 0.18 },                                        // ð θ
  18: { jawOpen: 0.08, mouthLowerDownLeft: 0.32, mouthLowerDownRight: 0.32,
        mouthRollLower: 0.30, mouthFunnel: 0.15 },                          // f v
  19: { jawOpen: 0.12, mouthShrugUpper: 0.22, tongueOut: 0.04 },            // d t n
  20: { jawOpen: 0.22, mouthPressLeft: 0.10, mouthPressRight: 0.10 },       // k g ŋ
  21: { jawOpen: 0.00, mouthClose: 1.00, mouthPressLeft: 0.45,
        mouthPressRight: 0.45, mouthRollLower: 0.15 },                      // p b m
};
```

Note the deliberate asymmetries: `FF` uses `mouthRollLower` so the lower lip tucks to the upper teeth; `SS` keeps the jaw almost shut with the corners pulled wide; `U` is mostly pucker with barely any jaw.

## 4.3 ② Anticipatory timing

Natural speech articulates **before** the sound — the mouth is already forming a vowel while the preceding consonant is still audible. Perceptually, humans also tolerate visuals leading audio far better than lagging.

**Shift the entire viseme timeline earlier by 40ms** (tunable 20–60ms). Cheap to implement, immediately noticeable.

## 4.4 ③ Coarticulation — the largest single quality gain

Do not switch visemes. Blend them with a dominance model.

For each ARKit channel *c* at time *t*, sum the contribution of every viseme within a ±120ms window:

```
weight(c, t) = Σᵢ  recipe[visemeᵢ][c] · dominance(c) · gaussian(t − tᵢ, σ(classᵢ))
               ──────────────────────────────────────────────────────────────
               Σᵢ  dominance(c) · gaussian(t − tᵢ, σ(classᵢ))
```

**Per-channel dominance** — some articulators resist being overridden by neighbours:

| Channel group | Dominance | Rationale |
|---|---|---|
| `mouthClose`, `mouthPress*` | 1.0 | Bilabials must win. A closed lip cannot be half-closed. |
| `mouthPucker`, `mouthFunnel` | 0.8 | Rounding is strong and spreads to neighbours. |
| `jawOpen` | 0.6 | Jaw is slow and heavily smoothed by adjacent sounds. |
| `mouthStretch*`, `mouthSmile*` | 0.5 | Spreading is easily overridden. |
| `tongueOut` | 0.9 | Tongue position is not negotiable when required. |

**σ by phoneme class:** plosives 25ms, fricatives 40ms, nasals 40ms, vowels 70ms. Vowels bleed into neighbours; plosives do not.

## 4.5 ④ Bilabial closure enforcement — the single biggest visible tell

**P, B and M must reach full lip closure.** They are typically 50–80ms long, and any blending will smear them into a half-open mouth. Viewers do not consciously notice correct bilabials; they absolutely notice missing ones. This is *the* thing that separates convincing lip-sync from obviously-fake lip-sync.

Rule: for any viseme 21 occurrence, override the blended result so that `mouthClose ≥ 0.9` and `jawOpen ≤ 0.03` across the middle 60% of its duration. Apply after coarticulation, not before.

Apply a weaker version to `FF` (18): force `mouthRollLower ≥ 0.25` at centre.

## 4.6 ⑤ Class-specific attack and decay

One global smoothing constant is wrong — a plosive and a vowel articulate at completely different speeds.

| Class | Attack τ | Release τ |
|---|---|---|
| Plosives (PP, DD, kk) | 25 ms | 40 ms |
| Fricatives (FF, SS, TH, CH) | 45 ms | 55 ms |
| Nasals / liquids (nn, RR) | 55 ms | 65 ms |
| Vowels (aa, E, I, O, U) | 80 ms | 100 ms |
| Return to silence | — | 140 ms |

**Use frame-rate-independent smoothing.** This is a real bug in most implementations:

```ts
// WRONG — speed depends on frame rate
w = THREE.MathUtils.lerp(w, target, 0.3);

// RIGHT
w += (target - w) * (1 - Math.exp(-dt / tau));
```

## 4.7 ⑥ Amplitude modulation

A shouted vowel and a whispered vowel share a viseme but not a jaw opening. Run an `AnalyserNode` on the audio, compute a smoothed RMS envelope, normalise, and scale the jaw:

```ts
jawOpen *= 0.55 + 0.75 * normalisedRms;
```

Apply to `jawOpen` and mildly to `mouthStretch*`. **Never** to `mouthClose` — a quiet "m" is still fully closed.

## 4.8 ⑦ Secondary motion

Perfect lips on a motionless head still look dead. Drive these from the same audio envelope and the sentence structure:

- **Brow:** `browInnerUp` tracks the RMS envelope at ~0.15 amplitude. Add a stronger raise on the first stressed syllable of a question.
- **Head:** small pitch nod on amplitude peaks (±2°), slow yaw drift (±3°, ~0.2Hz).
- **Blink:** every 2–6s randomised, plus a near-guaranteed blink at sentence boundaries (real speakers blink at clause breaks).
- **Gaze:** micro-saccades every 0.8–2s within ±3°; hold direct gaze while delivering a key number.
- **Silence posture:** never fully sealed. `jawOpen ≈ 0.02`, occasional slow swallow, lips parted slightly.

## 4.9 Multilingual considerations

Azure's viseme IDs are language-independent, so the recipes carry across. Two adjustments worth testing:

- **Hindi retroflex consonants (ट ठ ड ढ ण)** map to viseme 19 but articulate further back; the visible difference is small — acceptable.
- **Aspirated stops (ख घ छ झ थ ध फ भ)** have a stronger release burst. Consider a small `jawOpen` overshoot (+0.05, 30ms) on aspirated consonants if the TTS exposes them.
- **Hindi vowel length** is phonemic. Long vowels need longer holds — the coarticulation window handles this if you honour the actual viseme durations rather than assuming fixed spacing.

Do not build per-language recipe variants until you have looked at the output. This is open question 6 in `PROJECT_PLAN.md`.

---

## 4.10 Validation protocol

Do these in order. Each one catches a different failure.

1. **The pause test.** Play a sentence containing "papa", "mama", "baba". Pause on each bilabial frame. **The lips must be visibly sealed.** If they are not, §4.5 is not working. This test alone catches the most common failure.
2. **Quarter-speed playback.** Run at 0.25× and watch the transitions. Hard switching, popping, or channels snapping to zero will be obvious.
3. **The mute test.** Watch with sound off. It should read unmistakably as speech, not as a chewing motion.
4. **The rounding test.** "You knew Julie's new blue shoes" — heavy `U`/`O` sequence. Watch for the pucker sustaining across the phrase rather than resetting between words. If it resets, coarticulation is not blending.
5. **The sibilant test.** "She sells sea shells" — `SS` and `CH` alternation. The jaw should stay nearly closed throughout; if it flaps open, jaw dominance is too high.
6. **Cross-language.** Repeat 1–5 in Hindi. Record both and compare side by side.
7. **Frame-rate test.** Throttle to 30fps and confirm the timing is unchanged. If it slows down, §4.6 smoothing is frame-dependent.

**Gate:** a neutral observer, shown the muted video, describes it as "someone talking" rather than "an animated mouth."

---

## 4.11 Tuning workflow

Expose every constant through `leva` behind a dev flag: the 40ms lead, per-channel dominance, per-class τ values, the coarticulation window, the RMS scaling. Then load a fixture with a known-hard sentence, loop it, and tune live while watching.

**Tune in this order** — later parameters depend on earlier ones being right:

1. Bilabial closure (§4.5) — binary, either works or doesn't
2. Coarticulation window and σ (§4.4)
3. Per-class attack/decay (§4.6)
4. Anticipatory lead (§4.3)
5. Amplitude modulation depth (§4.7)
6. Individual recipe weights (§4.2) — last, and only for visemes that still look wrong

Record final values in `docs/DECISIONS.md`. You will change the model at some point and need to re-derive them.
