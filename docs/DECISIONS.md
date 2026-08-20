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
