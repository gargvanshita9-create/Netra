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
```

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
  - [ ] A6 — live TTS integration
  - [ ] A7 — stage design and polish
