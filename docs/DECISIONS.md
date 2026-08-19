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

## Open (deferred to Phase A)

- **R3F / React 19 compatibility** (PROJECT_PLAN.md open question #1, gate A2): `apps/web` currently uses React 19.2.8 as scaffolded by `create-vite`. Whether `@react-three/fiber` needs React 18 instead is not yet decided — no R3F code exists yet. Resolve and record here before writing `AvatarStage.tsx`.
