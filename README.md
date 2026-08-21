# Netra

A conversational data analyst. Ask a question in your own language, typed or spoken, and a full-body 3D avatar answers aloud while the screen renders the queried data. The underlying database is accessed **read-only**.

See [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for what's being built and [`CLAUDE.md`](./CLAUDE.md) for how.

**Current status:** Phase A (avatar spike) in progress — A1/A2/A3 done.

## Prerequisites

- Node.js (version pinned in [`.nvmrc`](./.nvmrc))
- [pnpm](https://pnpm.io/) 9
- [Docker](https://www.docker.com/) (Postgres 16 + MongoDB 7 via `docker-compose.yml`)

## Setup

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm seed:generate      # generates db/seed/03-seed-data.sql (only needed once, or after schema changes)
docker compose up -d    # Postgres + MongoDB, auto-applies db/init/*
pnpm dev                # apps/web on :5173, apps/api on :3000
```

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
pnpm seed:generate        # regenerate db/seed/03-seed-data.sql
pnpm inspect-glb <path>   # dump morph targets + clips from a GLB (Phase A)
pnpm verify-speech        # check Azure Speech credentials, voice names, and viseme output
```

## Speech synthesis

`apps/api` turns text into a `SpeechPacket` — audio plus the timestamped viseme
timeline that drives the avatar's lips.

```bash
curl -X POST localhost:3000/speech/synthesize \
  -H 'content-type: application/json' \
  -d '{"text":"Deposits grew nine percent last quarter.","lang":"en-IN"}'

curl localhost:3000/speech/usage   # today's Azure Speech spend
```

`NETRA_TTS_MODE` decides where the audio comes from:

| Mode | Behaviour |
|---|---|
| `fixture` (default) | Serves hand-authored packets from `apps/api/fixtures/speech/` and anything already in the synthesis cache. **Reaches the network never** — this is also the public demo mode. A sentence with no fixture returns 503 explaining how to add one. Lookup falls back across regions within a language, so `en-IN` finds an `en-US` recording. |
| `live` | Synthesises through Azure Speech, then caches the result. Requires `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`; the API refuses to start without them. |

Every synthesis is cached to `NETRA_TTS_CACHE_DIR` (default `.cache/tts`) under
`hash(text + lang + voice)`, so replaying one sentence while tuning lip-sync
bills exactly once. Azure is specified over better-sounding providers for one
reason only: it emits a timestamped viseme stream across 100+ languages
(`PROJECT_PLAN.md` §5.3).

## Repository layout

See `PROJECT_PLAN.md` §4.1 for the full annotated tree.

- `apps/web` — React + Vite + TypeScript. `src/avatar/` is Phase A only; it knows nothing about SQL, LLMs, or charts.
- `apps/api` — NestJS 11 + Fastify.
- `packages/contracts` — shared types, notably the frozen `SpeechPacket` contract.
- `db/init` — schema and the `netra_ro` read-only role (applied automatically by `docker compose up`).
- `db/seed` — generated seed data (retail-banking demo dataset, see `scripts/generate-seed-data.ts`).

## Read-only guarantee

The database is queried through the `netra_ro` Postgres role, which is granted `SELECT` only — no `INSERT`/`UPDATE`/`DELETE`/`DDL`. This is enforced at the database level, not just in application code. `apps/api/test/readonly-role.integration.spec.ts` asserts this and must never be deleted or weakened.

## Status

- [x] Phase 0 — foundation (workspace, contracts, DB, CI)
- [ ] Phase A — avatar spike
  - [x] A1 — asset acquisition and validation (see `docs/ASSET_NOTES.md`)
  - [x] A2 — static render (`AvatarStage.tsx`, `AvatarModel.tsx`)
  - [x] A3 — viseme playback from a fixture (`useVisemePlayer.ts`, `visemeMap.ts`, `public/fixtures/greeting.en.json`)
  - [ ] A4 — body animation and gestures
  - [ ] A5 — idle life
  - [x] A6 — live TTS integration (`POST /speech/synthesize`, caching, spend counter, fixture mode; verified live against Azure in English, Hindi, Tamil, Marathi, Telugu and Gujarati. See ADR-017 — bn-IN, kn-IN and ml-IN return audio but no visemes, so they degrade to amplitude-driven jaw motion.)
  - [ ] A7 — stage design and polish
