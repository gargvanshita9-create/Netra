# CLAUDE.md

Operating instructions for Claude Code in this repository.
Read `PROJECT_PLAN.md` for *what* to build. This file governs *how*.

---

## Project

**Netra** — a conversational data analyst. A non-technical user asks a question in their own language, typed or spoken. A full-body 3D avatar answers aloud with synchronised lip, jaw and hand movement, while the screen renders the queried data as a table, chart, or report with written analysis. The database is accessed **read-only**.

**Current phase: Phase 0 → Phase A (avatar spike).**
The avatar is being built *before* the intelligence layer, deliberately. See `PROJECT_PLAN.md` §2.

---

## Hard rules

These are not preferences. Violating one means the change gets reverted.

1. **Never write code that mutates the target database.** No `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `GRANT`, or `COPY … FROM`. The `netra_ro` role blocks this at the database level; application code must never be the only thing standing between a user and a write.
2. **Never delete or weaken the read-only permission test** in `apps/api`. If it fails, the fix is the code, never the test.
3. **Never commit secrets.** API keys, connection strings and passwords go in `.env`, which is gitignored. Update `.env.example` with the *key name only* whenever a new variable is introduced.
4. **Never import query, SQL, LLM or chart types into `apps/web/src/avatar/`.** That directory knows about `SpeechPacket` and nothing else. This isolation is the point of the whole phase ordering.
5. **Do not build ahead of the current phase.** No SQL generation, no prompts, no embeddings, no chart components during Phase 0/A — even if it seems trivially easy and even if it would "save time later". Ask instead.
6. **Do not use Ready Player Me.** It shut down on 31 January 2026; its APIs return errors. Most tutorials found by search will reference it. See `PROJECT_PLAN.md` §3.1.
7. **`SpeechPacket` is a frozen contract.** Additive optional fields are allowed. Any rename or removal requires an ADR in `docs/DECISIONS.md` and explicit sign-off.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Web | React + Vite + TypeScript + Tailwind | React version pinned per ADR-001 (R3F compatibility) |
| 3D | three.js + `@react-three/fiber` + `@react-three/drei` | Pin versions; do not upgrade casually |
| API | NestJS 11 + Fastify adapter + TypeScript | Modular monolith, feature modules |
| Contracts | `packages/contracts` | Shared types, imported by both apps |
| Target DB | PostgreSQL 16 | Queried read-only as `netra_ro` |
| App DB | MongoDB 7 | Conversations, saved reports, semantic-layer metadata (Phase 1+) |
| TTS | Azure Speech | Chosen for its timestamped viseme event stream |
| Package manager | pnpm workspaces | Never mix in npm or yarn |
| Validation | zod | Config, DTOs, LLM output parsing |

---

## Commands

```bash
pnpm install              # from repo root only
docker compose up -d      # Postgres + MongoDB
pnpm dev                  # both apps in parallel
pnpm --filter web dev
pnpm --filter api dev
pnpm -r typecheck         # must pass before any commit
pnpm -r lint
pnpm -r test
pnpm inspect-glb <path>   # dump morph targets + clips from a GLB
```

If a command in this list does not exist yet and the current task needs it, create it and update this section in the same change.

---

## Conventions

**TypeScript**
- `strict: true` everywhere. **No `any`.** Use `unknown` and narrow. If a third-party type is genuinely missing, write a local declaration and comment why.
- No non-null assertions (`!`) outside tests.
- Exported functions get explicit return types.
- Prefer discriminated unions over optional-field soup.

**Naming**
- Files: `kebab-case.ts`, except React components which are `PascalCase.tsx`.
- Hooks: `useThing.ts`. Types and interfaces: `PascalCase`. Constants: `SCREAMING_SNAKE`.
- Say what things are for, not how they are built: `useVisemePlayer`, not `useMorphTargetInfluenceController`.

**React / R3F**
- Function components and hooks only.
- Per-frame work goes in `useFrame`. **Never call `setState` inside `useFrame`** — mutate refs directly. A state update per frame will destroy the frame rate.
- Load assets through `useGLTF` / `useLoader` with a real `<Suspense>` fallback, never a blank canvas.
- Dispose geometries, materials and mixers on unmount.
- Tunable constants (smoothing factors, blink intervals, damping) get exposed through `leva` behind a dev flag, so they can be tuned by eye rather than by rebuild.

**NestJS**
- One feature module per domain concept. Constructor injection. Business logic in services, never controllers.
- All request and response DTOs validated with zod.
- Config read through the typed loader only — never `process.env` directly outside it.

**Errors**
- Fail loudly at startup on missing config; fail gracefully at runtime on external service failures.
- User-facing error messages state what went wrong and what to do next, in the interface's voice. Never "An error occurred."
- Never swallow an error to make a test pass.

**Git**
- Conventional commits: `feat(avatar): map azure visemes to oculus morph targets`.
- One sub-phase per branch. Keep diffs reviewable.

---

## Working style

**Before writing code**
- Re-read the relevant section of `PROJECT_PLAN.md`. If the task is not in the current phase, say so and stop.
- If the task is ambiguous, ask one specific question rather than guessing across three interpretations.
- For anything over ~50 lines, state the plan first and wait.

**While working**
- Follow the sub-phase gates in `PROJECT_PLAN.md` §5.1. Each gate is a stop-and-verify point, not a suggestion. **A1's blendshape check is a hard gate** — if the asset lacks viseme morph targets, do not write rendering code against it.
- Prefer editing existing files over creating new ones.
- Do not add a dependency without saying what it does and why the alternative was rejected.
- No placeholder or mock data outside `public/fixtures/` and tests.

**When you finish a task**
- Run `pnpm -r typecheck && pnpm -r lint`. Report failures rather than working around them.
- State plainly what was built, what was *not* built, and anything left uncertain.
- If a decision was made that a future reader would question, add it to `docs/DECISIONS.md` as an ADR.

**When something is wrong**
- If an instruction in this file conflicts with the task, flag the conflict — do not silently pick one.
- If a chosen approach turns out to be a dead end, say so early and directly. A wrong path reported in ten minutes costs ten minutes.
- If a search result looks stale (particularly anything about avatars, RPM, or 2025-era R3F tutorials), treat it as suspect and verify against current docs.

---

## Performance budget (Phase A)

Enforce these; do not defer them.

- Avatar model: ≤ 60k triangles, ≤ 8 MB Draco-compressed
- 60 fps desktop, ≥ 30 fps on mid-range mobile
- No per-frame allocations in the render loop — reuse vectors and quaternions
- Bundle: 3D assets code-split away from the initial route

---

## Cost discipline

Azure Speech is the only metered service in the current phase, but the habits are being set now.

- **Cache every TTS synthesis by `hash(text + lang + voice)`.** Tuning lip-sync means replaying the same sentence hundreds of times; paying each time is waste.
- `NETRA_TTS_MODE=fixture` must bypass all network calls entirely. This becomes the public demo mode later.
- Keep the daily spend counter in `apps/api` working even while the numbers are trivial.

---

## Communication

- Be direct. Skip the preamble and the flattery.
- Say "I don't know" or "I got this wrong" plainly.
- Push back when an instruction looks mistaken — including instructions from me. Silent compliance with a bad plan is worse than an argument.
- Short answers for short questions. Save the detail for where it earns its place.
