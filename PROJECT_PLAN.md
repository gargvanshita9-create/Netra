# Netra — Design & Implementation Plan
### Phase 0 (Foundation) + Phase A (Avatar Spike)

> "Netra" (नेत्र — eye). The docs use `netra` as the package scope.

---

## 0. What this document is

This is the build spec for the **first two phases only**. It is deliberately narrow. Everything after Phase A is summarised in §9 for context, but **must not be implemented yet**.

**Read this first if you are Claude Code:** also read `CLAUDE.md` in the repo root. That file governs conventions and hard rules. This file governs *what to build*.

---

## 1. Product in one paragraph

Netra is a conversational data analyst. A non-technical user (marketing, ops, management) asks a question in their own language — typed or spoken — and a full-body 3D avatar answers out loud, while the screen shows the queried data as a table, chart, or generated report with written analysis. The avatar's jaw, lips, face and hands move in time with its speech. The underlying database is accessed **read-only**.

---

## 2. Why the avatar is being built first

Normal engineering order would be brain → voice → face. We are inverting it deliberately for one reason: **the avatar is the highest-risk, highest-unknown component**, and it is the component with the least reusable prior art (see §3.1). Discovering in month three that the rig has no viseme blendshapes would be fatal. Discovering it in week two is cheap.

The cost of inverting the order is that the avatar has nothing to say. We pay that cost by driving it from **fixture files** — hand-authored `SpeechPacket` JSON — and by treating the `SpeechPacket` interface as a **frozen contract** (§6). When the brain is built in later phases, it produces `SpeechPacket`s and the avatar layer requires zero changes.

**Non-goal for Phase A:** any database, any LLM call, any query. If a task tempts you toward SQL or prompts, it is out of scope.

---

## 3. Critical context and constraints

### 3.1 Ready Player Me is dead — most tutorials are stale

Ready Player Me was acquired by Netflix in December 2025 and **shut down its avatar creator, PlayerZero, and all public developer APIs on 31 January 2026**. Runtime calls to RPM endpoints fail. Roughly 80% of "React 3D talking avatar" tutorials online reference RPM and are now unusable end-to-end (the *morph-target technique* in them is still valid — only the asset source is dead).

**Implication:** we must source and own our own GLB/VRM asset. Asset acquisition is therefore Task A1, before any rendering code.

### 3.2 Viseme blendshapes are a hard requirement

Lip-sync quality is bounded entirely by the mesh. A rig without ARKit or Oculus viseme blendshapes can only do amplitude-driven jaw flapping, which looks broken and cannot be fixed in code later. **Validating the blendshapes on the asset is a gate, not a step.**

### 3.3 React 19 / three.js compatibility

`@react-three/fiber` has had version-alignment issues with React 19. Pin versions during Phase 0 and verify a static cube renders before touching a character model. If R3F v9+ works cleanly with React 19, use it; otherwise pin React 18 for `apps/web` and record the decision in `docs/DECISIONS.md`.

### 3.4 Multilingual is a lip-sync constraint, not just a text constraint

Hindi, Tamil and Bengali phoneme sets differ from English. This is why Azure Speech is specified for TTS (§5.3): it emits **timestamped viseme events across 100+ languages**, so lip-sync is driven by real phoneme data rather than English-only heuristics. Do not substitute a TTS provider that lacks viseme output without re-planning this phase.

---

## 4. Phase 0 — Foundation

**Duration:** 3–4 days. **Goal:** a repo that runs, with contracts and infrastructure in place, so Phase A has nowhere to improvise.

### 4.1 Repository layout

```
netra/
├── CLAUDE.md
├── PROJECT_PLAN.md
├── README.md
├── docker-compose.yml
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── .env.example
├── .nvmrc
├── apps/
│   ├── web/                     # React + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── avatar/          # ← all Phase A work lives here
│   │   │   │   ├── AvatarStage.tsx
│   │   │   │   ├── AvatarModel.tsx
│   │   │   │   ├── useVisemePlayer.ts
│   │   │   │   ├── useGesturePlayer.ts
│   │   │   │   ├── useIdleMotion.ts
│   │   │   │   └── visemeMap.ts
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   └── main.tsx
│   │   └── public/
│   │       ├── models/          # avatar.glb, animation clips
│   │       └── fixtures/        # SpeechPacket JSON + audio, Phase A only
│   └── api/                     # NestJS 11 + Fastify
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── speech/          # stub in Phase 0, real in Phase 5
│           └── health/
├── packages/
│   └── contracts/               # shared TS types — the frozen interfaces
│       └── src/
│           ├── speech-packet.ts
│           ├── gesture.ts
│           └── index.ts
├── db/
│   ├── init/01-readonly-role.sql
│   └── seed/
├── scripts/
│   └── inspect-glb.ts           # blendshape validator (Task A1)
└── docs/
    ├── DECISIONS.md
    └── ASSET_NOTES.md
```

### 4.2 Phase 0 task list

| # | Task | Acceptance criteria |
|---|------|---------------------|
| P0.1 | pnpm workspace + TS strict config + ESLint/Prettier | `pnpm -r typecheck` and `pnpm -r lint` pass on empty apps |
| P0.2 | `apps/web` — Vite + React + TS + Tailwind | `pnpm dev` serves a page at `:5173` |
| P0.3 | `apps/api` — NestJS 11 + Fastify adapter, `/health` returns `{status:"ok"}` | `curl localhost:3000/health` succeeds |
| P0.4 | `packages/contracts` with `SpeechPacket`, `Viseme`, `GestureId`, `Emotion` (§6) | Both apps import from `@netra/contracts` and typecheck |
| P0.5 | `docker-compose.yml`: Postgres 16 + MongoDB 7 | `docker compose up` → both healthy |
| P0.6 | `db/init/01-readonly-role.sql` creating `netra_ro` (§4.3) | Connecting as `netra_ro` and running `INSERT` raises a permission error |
| P0.7 | Seed Postgres with a business-shaped dataset (Olist e-commerce or Northwind) | ≥8 related tables, ≥10k rows in the fact table |
| P0.8 | `.env.example` + typed config loader (zod) in both apps | App exits with a readable error if a required var is missing |
| P0.9 | GitHub Actions CI: install → lint → typecheck → build | Green on first push |
| P0.10 | `README.md` skeleton + `docs/DECISIONS.md` with the first ADR | Committed |

### 4.3 Read-only role (write this now, use it in Phase 1)

The read-only posture must be established at the database level, not enforced in application code. Application-level enforcement is a second line of defence, never the first.

```sql
CREATE ROLE netra_ro LOGIN PASSWORD :'ro_password';
REVOKE ALL ON DATABASE netra_demo FROM PUBLIC;
GRANT CONNECT ON DATABASE netra_demo TO netra_ro;
GRANT USAGE ON SCHEMA public TO netra_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO netra_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO netra_ro;
ALTER ROLE netra_ro SET statement_timeout = '10s';
ALTER ROLE netra_ro SET default_transaction_read_only = on;
```

Write an integration test in Phase 0 that asserts `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE` and `DROP TABLE` all fail as `netra_ro`. That test must never be deleted.

### 4.4 Phase 0 exit gate

- [ ] `docker compose up && pnpm dev` gives a running web app and API
- [ ] The read-only permission test passes
- [ ] `@netra/contracts` exports `SpeechPacket` and both apps consume it
- [ ] CI green

---

## 5. Phase A — Avatar Spike

**Duration:** ~2 weeks. **Goal:** a full-body 3D avatar in React that speaks a `SpeechPacket` with accurate lip-sync, gestures, and idle life — driven entirely by fixtures, no backend intelligence.

### 5.1 Sub-phases

Each sub-phase is a commit-worthy milestone with a visible result. Do not start the next until the previous one's gate passes.

---

#### A1 — Asset acquisition and validation  *(gate — do not skip)*

Because RPM is gone (§3.1), pick one source:

| Option | Path | Trade-off |
|---|---|---|
| **A (recommended start)** | Use the sample avatar shipped with [TalkingHead.js](https://github.com/met4citizen/talkinghead) — already has ARKit + Oculus visemes and a Mixamo-compatible rig | Fastest route to a working lip-sync loop; de-risks everything else. Swap for a custom model later. |
| **B** | VRoid Studio → VRM 1.0 + `@pixiv/three-vrm` | Free, fully customisable, good body rig. But VRM's native expression set has only ~5 mouth shapes (`aa/ih/ou/ee/oh`) — coarser lip-sync unless you author ARKit shapes in Blender. |
| **C** | Blender: source a CC0 humanoid, author ARKit blendshapes, rig via Mixamo auto-rigger | Full control, best result, several days of non-code work. |

**Decision rule:** start with A. Record in `docs/ASSET_NOTES.md` the source, licence, poly count, file size, and the full list of morph target names found.

Write `scripts/inspect-glb.ts` (Node + `@gltf-transform/core` or `three`'s `GLTFLoader` headless) that prints:
- every mesh name
- every `morphTargetDictionary` key
- the animation clip names
- triangle count and file size

**A1 gate:** the script confirms the model exposes **at least the 15 Oculus visemes** (`viseme_sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U`) or the ARKit equivalents, plus `eyeBlinkLeft`/`eyeBlinkRight` or equivalents. If it does not, the asset is rejected — return to the table above. **Do not write rendering code against a rejected asset.**

Also record the target performance budget here: **≤ 60k triangles, ≤ 8 MB Draco-compressed, 60 fps on a mid-range laptop, 30 fps floor on mobile.**

---

#### A2 — Static render

`AvatarStage.tsx`: R3F `<Canvas>`, the model loaded via `useGLTF`, a three-point-ish lighting setup, `OrbitControls` behind a dev flag, camera framed on head-and-torso with the full body visible on wider viewports.

**A2 gate:** the avatar renders, holds 60 fps, and does not regress on window resize. Suspense fallback shows a loading state rather than a blank canvas.

---

#### A3 — Viseme playback from a fixture

The core mechanic. `useVisemePlayer.ts` takes a viseme timeline and an `HTMLAudioElement`, and on every `useFrame` tick:

1. Reads `audio.currentTime`.
2. Finds the active viseme for that timestamp.
3. Maps the Azure viseme ID → morph target name via `visemeMap.ts` (§7).
4. `lerp`s the target's `morphTargetInfluences` toward 1 and every other viseme toward 0, with a smoothing factor (~0.3–0.5 as a starting point; expose it via `leva` for live tuning).

Hand-author `public/fixtures/greeting.en.json` with a matching MP3. Two or three fixtures is enough.

**A3 gate:** press play, the avatar's mouth visibly and plausibly matches the audio. Record a screen capture — this is the first artefact worth putting in the README.

**Fallback path if visemes are unavailable for some language:** a Web Audio `AnalyserNode` on the audio stream, mapping RMS amplitude in the 85–255 Hz speech band to a single `jawOpen` morph. This is visibly worse. It is a fallback, never the primary path.

---

#### A4 — Body animation and gestures

Load Mixamo FBX clips (retargeted to the rig, or GLB clips if the asset ships them). Minimum set:

`idle`, `talking_neutral`, `talking_emphatic`, `explaining`, `pointing`, `greeting`, `thinking`

`useGesturePlayer.ts` uses `AnimationMixer` with `crossFadeTo` (~0.3s) between clips. **Face and body are driven independently** — the gesture clip must not overwrite the morph target influences the viseme player is setting. If the imported clips animate facial bones, strip those tracks on load.

`SpeechPacket.gesture` selects the clip; on speech end, cross-fade back to `idle`.

**A4 gate:** playing a fixture with `gesture: "explaining"` produces simultaneous, non-conflicting hand movement and lip-sync.

---

#### A5 — Idle life

Small, cheap, disproportionately effective:

- **Blinking:** randomised interval 2–6s, ~120ms close/open curve.
- **Breathing:** subtle sinusoidal chest/shoulder offset.
- **Head follow:** head yaw/pitch tracks the cursor, clamped to ±20° yaw and ±12° pitch, heavily damped. Disable when a gesture clip drives the neck.
- **Saccades:** tiny random eye darts.

**A5 gate:** the avatar looks alive when silent for 30 seconds.

---

#### A6 — Live TTS integration

Replace fixtures with real speech. `apps/api` gains `POST /speech/synthesize` accepting `{ text, lang, voice }` and returning a real `SpeechPacket`.

Azure Speech SDK emits `visemeReceived` events with `audioOffset` (in 100-nanosecond ticks — divide by 10,000 for milliseconds) and a `visemeId` (0–21). Collect these during synthesis, return them alongside base64 audio.

This is the moment the frozen contract proves itself: **the entire avatar layer should require zero changes.** If it needs changes, the contract was wrong — fix the contract, not the avatar.

**A6 gate:** type arbitrary text in three languages (English, Hindi, one more), the avatar speaks it with correct lip-sync.

---

#### A7 — Stage design and polish

The avatar needs a *stage*, not a grey void. Design direction for the shell (kept deliberately restrained so the avatar is the focal point):

- **Layout:** avatar occupies the left third on desktop; the right two-thirds is reserved, empty, labelled space for the data panel that arrives in Phase 2. Building that reservation now prevents a painful re-layout later. On mobile, avatar collapses to a header band.
- **Signature element:** a subtle audio-reactive element tied to the actual speech amplitude — the one place to spend visual boldness. Everything else stays quiet.
- **States to design explicitly:** `idle`, `listening`, `thinking`, `speaking`, `error`. Each needs a distinct, immediately readable visual treatment. `thinking` matters most — it will cover 2–4 seconds of LLM latency in later phases, and an unexplained pause reads as a broken app.
- **Accessibility floor:** captions for all spoken output (non-negotiable — also makes your demo GIF legible without sound), visible keyboard focus, `prefers-reduced-motion` respected by disabling idle motion and gesture crossfades.

**Do not** pick a warm-cream-plus-serif-plus-terracotta palette or a near-black-plus-acid-green palette. Both are current AI-default looks. Derive the palette from the product's own subject: this is a *data instrument*, so consider the vocabulary of measurement and readouts.

---

### 5.2 Phase A exit gate

- [ ] Avatar speaks arbitrary text in ≥3 languages with viseme-accurate lip-sync
- [ ] Gestures fire without conflicting with facial animation
- [ ] Idle motion present; the character does not look frozen
- [ ] 60 fps desktop, ≥30 fps mobile, model within budget
- [ ] `SpeechPacket` unchanged since Phase 0 — or changed once, deliberately, with an ADR
- [ ] Demo GIF recorded and in the README
- [ ] Captions render for all spoken output

### 5.3 Provider note

**Azure Speech is specified for TTS specifically because of the viseme event stream** (§3.4). ElevenLabs has better voice quality but does not hand you a timestamped viseme timeline as cleanly, which would force you back onto amplitude-driven lip-sync. If voice quality later matters more than lip-sync fidelity, the escape hatch is to generate audio with ElevenLabs and derive visemes offline with [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync) — but Rhubarb is English-oriented, which conflicts with the multilingual requirement. Treat this as a Phase 5 decision, not a Phase A one.

---

## 6. The frozen contract

`packages/contracts/src/speech-packet.ts`. **This is the most important artefact in Phase A.** Every later phase produces this shape; the avatar only ever consumes it.

```ts
/** Azure Speech viseme ID, 0–21. 0 = silence. */
export type VisemeId = number;

export interface VisemeFrame {
  /** Milliseconds from the start of the audio. */
  timeMs: number;
  visemeId: VisemeId;
}

export type GestureId =
  | 'idle'
  | 'talking_neutral'
  | 'talking_emphatic'
  | 'explaining'
  | 'pointing'
  | 'greeting'
  | 'thinking';

export type Emotion = 'neutral' | 'positive' | 'concerned';

export interface SpeechPacket {
  /** Stable id for caching and replay. */
  id: string;
  /** The spoken text — also rendered as captions. */
  text: string;
  /** BCP-47 tag, e.g. "en-IN", "hi-IN", "ta-IN". */
  lang: string;
  /** Base64 audio (fixtures, short replies) or a URL (streamed/cached). Exactly one. */
  audioBase64?: string;
  audioUrl?: string;
  /** MIME type of the audio, e.g. "audio/mpeg". */
  audioMimeType: string;
  /** Total audio duration in ms. */
  durationMs: number;
  /** Ordered, ascending by timeMs. Empty array ⇒ avatar falls back to amplitude-driven jaw. */
  visemes: VisemeFrame[];
  /** Body animation to play while speaking. */
  gesture: GestureId;
  /** Drives subtle facial expression offsets. */
  emotion: Emotion;
}
```

### Rules governing this contract

1. **Additive changes only** after Phase 0 ends. New optional fields are fine; renaming or removing fields requires an ADR in `docs/DECISIONS.md`.
2. **The avatar layer imports nothing else.** No knowledge of SQL, LLMs, charts, or the database ever reaches `apps/web/src/avatar/`. If you find yourself importing a query type into an avatar component, stop — the architecture has drifted.
3. **Fixtures and live TTS are indistinguishable to the consumer.** The avatar cannot know which one it is playing.

---

## 7. Azure viseme → Oculus morph target mapping

Starting map for `visemeMap.ts`. Tune by eye during A3; these assignments are a reasonable baseline, not gospel.

| Azure ID | Approx. phonemes | Oculus morph target |
|---|---|---|
| 0 | silence | `viseme_sil` |
| 1 | æ, ə, ʌ | `viseme_aa` |
| 2 | ɑ | `viseme_aa` |
| 3 | ɔ | `viseme_O` |
| 4 | ɛ, ʊ | `viseme_E` |
| 5 | ɝ | `viseme_E` |
| 6 | j, i, ɪ | `viseme_I` |
| 7 | w, u | `viseme_U` |
| 8 | o | `viseme_O` |
| 9 | aʊ | `viseme_aa` |
| 10 | ɔɪ | `viseme_O` |
| 11 | aɪ | `viseme_aa` |
| 12 | h | `viseme_sil` |
| 13 | ɹ | `viseme_RR` |
| 14 | l | `viseme_nn` |
| 15 | s, z | `viseme_SS` |
| 16 | ʃ, tʃ, dʒ, ʒ | `viseme_CH` |
| 17 | ð | `viseme_TH` |
| 18 | f, v | `viseme_FF` |
| 19 | d, t, n, θ | `viseme_DD` |
| 20 | k, g, ŋ | `viseme_kk` |
| 21 | p, b, m | `viseme_PP` |

If the chosen asset uses ARKit names instead (`jawOpen`, `mouthFunnel`, `mouthPucker`, `mouthClose`, …), write a second map rather than renaming morph targets on the mesh — keep the asset untouched so it can be swapped.

---

## 8. Budget guardrails for Phase A

Phase A spend is small but not zero, and the habits set here matter later.

- Azure Speech TTS is the only paid call in this phase. Expect **well under $5** across the whole spike if you cache aggressively.
- **Cache every synthesis by `hash(text + lang + voice)`** to disk in dev. During A6 you will replay the same sentence hundreds of times while tuning smoothing constants; paying for each one is pure waste.
- Build the fixture path such that `NETRA_TTS_MODE=fixture` bypasses the API entirely. This becomes the public demo mode later.
- Add a daily spend counter in `apps/api` now, even though it is trivially small now. It will not be trivial in Phase 5.

---

## 9. Where this sits in the full roadmap *(context only — do not build)*

| Phase | Content | Status |
|---|---|---|
| **0** | Foundation, contracts, read-only DB | ← build now |
| **A** | Avatar spike | ← build now |
| 1 | Semantic layer + schema retrieval + NL→SQL | later |
| 2 | SQL guardrails, execution, table/chart rendering | later |
| 3 | Narrative analysis + PDF report export + PII masking | later |
| 4 | Multilingual pipeline (detect → English intent → localised narrative) | later |
| 5 | Voice input (STT) + full voice loop | later |
| 6 | Wire the brain into the avatar via `SpeechPacket` | later |
| 7 | Demo mode, spend caps, deploy, docs | later |

Phase 6 is short *because* of Phase A's contract discipline. That is the whole bet of building the avatar first.

---

## 10. Open questions to resolve during the spike

Log answers in `docs/DECISIONS.md` as they are resolved.

1. Does R3F work with React 19 in this stack, or is React 18 needed? (A2)
2. Does the chosen asset survive Draco compression without blendshape corruption? (A1)
3. What smoothing factor makes lip-sync read as natural rather than rubbery? (A3)
4. Can gesture clips be stripped of facial tracks reliably at load time, or must they be cleaned in Blender? (A4)
5. What is the real mobile frame rate on a mid-range Android device, and does the model need an LOD variant? (A2/A7)
6. How different does Hindi lip-sync look versus English with the same viseme map — does the map need per-language variants? (A6)
