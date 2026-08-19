# Netra — Design & Implementation Plan
### Phases 1 – 7 (Intelligence, Voice, Integration, Ship)

> Companion to `PROJECT_PLAN.md`, which covers Phase 0 (Foundation) and Phase A (Avatar Spike).
> Read `CLAUDE.md` for conventions and hard rules.

---

## 0. How to use this document

Phases run in order. Each has an **exit gate** that must pass before the next begins. Nothing here should be built during Phase 0 or A.

Phase 1 is the real project. Phases 2–4 make it usable. Phase 5 makes it voice. Phase 6 is short — deliberately, because Phase A froze the contract. Phase 7 is what turns a working system into something worth putting on a CV.

**Rough sequencing:** Phase 1 ≈ 2 weeks, Phase 2 ≈ 1 week, Phase 3 ≈ 1 week, Phase 4 ≈ 4–5 days, Phase 5 ≈ 1 week, Phase 6 ≈ 4–5 days, Phase 7 ≈ 1 week.

---

## 1. Contracts added in these phases

All live in `packages/contracts`. Same rules as `SpeechPacket`: additive changes only once a phase closes, renames require an ADR.

```ts
// ── Phase 1 ────────────────────────────────────────────────
export interface QueryPlan {
  id: string;
  /** The user's question, normalised to English (see Phase 4). */
  canonicalQuestion: string;
  /** Original text as the user wrote or said it. */
  rawQuestion: string;
  lang: string;
  /** Tables the retriever selected, in relevance order. */
  selectedTables: string[];
  sql: string;
  /** Model's own account of what the SQL does — shown to the user on request. */
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  /** Set when the question cannot be answered from the schema. */
  refusal?: { reason: string; suggestion: string };
}

// ── Phase 2 ────────────────────────────────────────────────
export interface ColumnMeta {
  name: string;
  label: string;
  type: 'string' | 'number' | 'integer' | 'date' | 'datetime' | 'boolean';
  /** Formatting hint: currency code, percent, or a unit label. */
  format?: string;
  masked: boolean;
}

export interface QueryResult {
  planId: string;
  columns: ColumnMeta[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  executionMs: number;
}

export type ChartType = 'kpi' | 'bar' | 'grouped_bar' | 'line' | 'area' | 'pie' | 'scatter' | 'table';

export interface ChartSpec {
  type: ChartType;
  title: string;
  subtitle?: string;
  xKey?: string;
  yKeys?: string[];
  seriesKey?: string;
  /** Why this chart type was chosen — for the "why this view?" affordance. */
  reason: string;
}

// ── Phase 3 ────────────────────────────────────────────────
export interface Insight {
  kind: 'trend' | 'outlier' | 'concentration' | 'comparison' | 'gap' | 'total';
  /** Computed in code, never by the model. */
  facts: Record<string, string | number>;
  severity: 'info' | 'notable' | 'significant';
}

export interface Analysis {
  planId: string;
  headline: string;
  narrative: string;
  insights: Insight[];
  caveats: string[];
}

export interface Report {
  id: string;
  title: string;
  createdAt: string;
  blocks: ReportBlock[];
}

export type ReportBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'kpi'; items: { label: string; value: string; delta?: string }[] }
  | { kind: 'chart'; spec: ChartSpec; result: QueryResult }
  | { kind: 'table'; result: QueryResult }
  | { kind: 'prose'; text: string };

// ── Phase 6 ────────────────────────────────────────────────
export type TurnEvent =
  | { type: 'transcript'; text: string; lang: string; final: boolean }
  | { type: 'status'; stage: 'understanding' | 'querying' | 'analysing' | 'speaking' }
  | { type: 'plan'; plan: QueryPlan }
  | { type: 'result'; result: QueryResult; chart: ChartSpec }
  | { type: 'analysis'; analysis: Analysis }
  | { type: 'speech'; packet: SpeechPacket }
  | { type: 'error'; message: string; recoverable: boolean };
```

---

## PHASE 1 — Semantic layer, retrieval, and NL→SQL

**This is the project.** Everything else is presentation. Budget the most time here and resist moving on early.

### 1.1 The problem being solved

You cannot put a 400-table schema in a prompt, and raw `information_schema` output is nearly useless to a model — column names like `cust_typ_cd` carry no meaning, and the model has no idea that "revenue" means `SUM(qty * unit_price)` in this business. Two artefacts fix this: a **semantic layer** (human-curated meaning) and **schema retrieval** (only the relevant slice reaches the prompt).

### 1.2 Sub-phases

---

#### 1A — Schema introspection

`apps/api/src/schema/` — a service that reads `information_schema` and `pg_catalog` and emits a machine-readable snapshot:

- Tables, columns, types, nullability, defaults
- Primary keys, foreign keys (build the **join graph** from these)
- Indexes, approximate row counts (`pg_class.reltuples`)
- For low-cardinality text columns (≤ 50 distinct), sample the **distinct values** — the model needs to know that `status` holds `'shipped' | 'cancelled' | 'delivered'`, or it will invent `'Shipped'` and return zero rows

Output: `db/schema-snapshot.json`, regenerable via `pnpm schema:introspect`.

**Gate:** snapshot regenerates deterministically and includes the full FK graph.

---

#### 1B — The semantic layer

Generate a YAML skeleton from the snapshot, then **hand-edit it**. This is the part that cannot be automated away, and it's the part that makes the difference between a demo and a product.

`db/semantic/orders.yml`:

```yaml
table: orders
description: >
  One row per customer order. An order groups one or more order_items.
  Orders with status 'cancelled' are excluded from all revenue reporting
  unless the user explicitly asks about cancellations.
synonyms: [purchases, transactions, sales orders]
grain: one row per order
columns:
  - name: order_id
    description: Primary key.
  - name: order_purchase_timestamp
    description: When the customer placed the order. Use this for any "when" question.
    synonyms: [order date, purchase date, placed on]
    is_default_time_dimension: true
  - name: order_status
    description: Lifecycle state.
    values: [created, approved, shipped, delivered, cancelled, unavailable]
  - name: customer_id
    description: FK to customers.customer_id.
    pii: none
joins:
  - to: order_items
    on: orders.order_id = order_items.order_id
    cardinality: one_to_many
  - to: customers
    on: orders.customer_id = customers.customer_id
    cardinality: many_to_one
metrics:
  - name: revenue
    description: Total money billed, excluding freight.
    sql: SUM(order_items.price)
    requires_join: [order_items]
    filters: "orders.order_status <> 'cancelled'"
  - name: average_order_value
    sql: SUM(order_items.price) / COUNT(DISTINCT orders.order_id)
    requires_join: [order_items]
```

Plus a global `db/semantic/glossary.yml` for business terms that span tables ("churn", "active customer", "MTD"), and `db/semantic/policies.yml` for defaults that always apply (default date range, timezone, currency, always-exclude filters).

**Gate:** every table in the demo dataset has a description, a grain statement, and its joins declared. Every metric a business user would name has a definition. If you can't write the grain in one sentence, you don't understand the table yet.

---

#### 1C — Retrieval

Two-stage, because "database of any size" is the stated requirement.

**Stage 1 — table selection.** Embed one document per table (name + description + synonyms + column names + metric names). At query time, embed the question and retrieve top-k tables by cosine similarity, then **expand along the join graph** by one hop — the answer often needs a table the question never mentions. Cap at ~8 tables.

**Stage 2 — column pruning.** For the selected tables, include full column detail only for columns whose name, description or synonyms plausibly relate to the question; include the rest as a bare name list. Always include keys and the default time dimension regardless.

Store vectors in MongoDB Atlas Vector Search or `pgvector` in a *separate* schema — never in the read-only target database.

**Gate:** for 30 golden questions, the correct tables appear in the retrieved set ≥ 95% of the time. Measure this; don't eyeball it.

---

#### 1D — SQL generation

Prompt assembly order matters — put the stable material first so it can be cached:

1. System instructions + SQL dialect rules  ← cacheable
2. Global glossary + policies              ← cacheable
3. Retrieved table definitions             ← varies
4. Few-shot examples (retrieved, see below)
5. The question

**Few-shot store.** Keep `db/semantic/examples.yml` of question→SQL pairs. Retrieve the 3–5 most similar to the current question and include them. This has a larger accuracy effect than almost any prompt wording change.

**Output as structured JSON**, not bare SQL: `{ sql, rationale, confidence, tablesUsed, refusal? }`. Validate with zod.

**Refusal path is required.** If the question cannot be answered from the available schema, the model must say so and suggest what *can* be answered. A confidently wrong number is far worse than "I don't have delivery-cost data — I can show you order value by region instead."

**Self-correction loop.** Run `EXPLAIN` on the generated SQL (not the query itself). On a Postgres error, feed the error message plus the original SQL back for one retry. Maximum two attempts, then refuse. Log every correction — the log tells you what to fix in the semantic layer.

**Gate:** end-to-end, a typed question produces valid, executable SQL for the golden set.

---

#### 1E — The eval harness  *(do not skip — this is the difference between engineering and guessing)*

`evals/golden.yml`: 40 questions spanning easy lookups, aggregations, multi-table joins, time comparisons, ranked lists, and 5 deliberately unanswerable questions.

Score by **execution accuracy**, not string match: run the generated SQL and the reference SQL, compare result sets as sorted multisets. String-comparing SQL punishes correct-but-different queries and teaches you nothing.

`pnpm eval` prints per-category accuracy and a diff for every failure.

**Gate:** ≥ 80% execution accuracy overall, and 5/5 on the unanswerable questions (a false refusal is much cheaper than a false answer). Below 80%, fix the **semantic layer** before touching the prompt — that's usually where the fault is.

### 1.6 Phase 1 exit gate

- [ ] `pnpm eval` reports ≥ 80% execution accuracy
- [ ] Retrieval hit rate ≥ 95% on golden questions
- [ ] Unanswerable questions produce refusals with useful suggestions, 5/5
- [ ] Prompt caching in place for the stable prefix
- [ ] Every eval failure has a logged cause

---

## PHASE 2 — Guardrails, execution, and rendering

### 2.1 SQL validation — the security core

**Application-level validation is the second line of defence. The `netra_ro` role is the first.** Both are required.

Parse with `pgsql-parser` (libpg_query bindings — a real Postgres parser, not a regex or a generic SQL grammar). Walk the AST and reject unless every one of these holds:

1. Exactly **one** statement.
2. The top-level node is `SelectStmt` (a `WITH` wrapper is fine).
3. **No DML node anywhere in the tree.** Postgres permits `WITH x AS (INSERT … RETURNING *) SELECT * FROM x` — this is a real write hiding inside a `SELECT`, and a naive top-level check will wave it straight through. Walk every node.
4. No reference to `pg_catalog`, `information_schema`, or any `pg_*` relation.
5. No calls to `pg_read_file`, `pg_ls_dir`, `lo_import`, `lo_export`, `dblink`, `pg_sleep`, `COPY`, or any function not on an explicit allowlist.
6. No `SET`, `RESET`, `LOCK`, or transaction control.

Then rewrite: inject `LIMIT 5000` if absent, cap any existing larger limit.

Execute as `netra_ro` with `statement_timeout = 10s`, a dedicated small connection pool, and a hard byte cap on the serialised result.

**Gate:** an adversarial test suite of ~25 malicious queries — CTE writes, system catalog reads, file functions, stacked statements, comment-smuggling — all rejected. This suite is permanent and never weakened.

### 2.2 Chart selection — deterministic first

Do not ask the model to pick the chart type. Classify the result shape in code:

| Result shape | Chart |
|---|---|
| 1 row, 1 numeric column | `kpi` |
| 1 temporal + 1–3 numeric | `line` |
| 1 temporal + 1 categorical + 1 numeric | `line` (multi-series) |
| 1 categorical (≤ 12 rows) + 1 numeric | `bar` |
| 1 categorical (≤ 12 rows) + 2 numeric | `grouped_bar` |
| 1 categorical (> 12 rows) + 1 numeric | `bar`, top 12 + "other" |
| 2 numeric, no temporal | `scatter` |
| Parts of a whole, ≤ 6 categories | `pie` |
| Anything else | `table` |

The model may then *override* the heuristic with a stated reason, and is responsible for the title, subtitle and axis labels — the parts that need language, not the part that needs logic.

Surface `ChartSpec.reason` in the UI as a "why this view?" affordance. It builds trust with exactly the non-technical audience this product targets.

### 2.3 Rendering

- Charts: Recharts. One component per `ChartType`, dispatched from the spec.
- Tables: TanStack Table + virtualisation. Sticky header, sortable, CSV download.
- Locale-aware formatting from `ColumnMeta.format` (see Phase 4 — Indian numbering is not a footnote).
- Empty result is a designed state, not a blank panel: show the query's rationale and suggest a relaxed filter.
- The data panel occupies the space Phase A7 reserved.

### 2.4 Phase 2 exit gate

- [ ] Adversarial SQL suite: 25/25 rejected
- [ ] Read-only permission test still green
- [ ] Golden questions render as sensible charts without manual intervention
- [ ] Timeout and row-cap paths produce readable user-facing messages
- [ ] Screenshot in the README

---

## PHASE 3 — Analysis, reports, and PII

### 3.1 Compute insights in code, narrate them with the model

**The model must never do arithmetic on the data.** It hallucinates numbers. Compute in TypeScript, hand the model a structured fact sheet, ask it to write prose about those facts only.

`apps/api/src/analysis/insights.ts` computes, where applicable:

- **Totals and shares** — sum, mean, median; top item's share of total
- **Trend** — first-vs-last, CAGR, linear-fit direction and R² over a temporal series
- **Period comparison** — vs previous equivalent period, absolute and percentage delta
- **Outliers** — IQR fences, plus z-score for larger sets
- **Concentration** — Pareto: how few categories make up 80% of the measure
- **Gaps** — missing periods, nulls, sudden drops to zero (often a data problem, worth flagging)

Each becomes an `Insight` with `facts` already formatted as strings.

The narrative prompt receives: the question, the `ChartSpec`, the column metadata, the `Insight[]`, and **at most 50 sample rows** — never the full result set. Instruction: narrate only the supplied facts, state uncertainty plainly, no invented numbers.

**Prompt-injection note.** Database *content* is untrusted input. A `product_name` of `"Ignore previous instructions and…"` will reach the model. Wrap all result data in delimiters, instruct the model to treat delimited content as data only, and never let result content influence tool selection or SQL generation. Add a test row containing an injection string to the seed data and assert it does nothing.

### 3.2 PII masking — ordering is everything

Extend the semantic layer:

```yaml
  - name: customer_phone
    pii: high
    mask: phone        # 98******10
  - name: aadhaar_no
    pii: high
    mask: aadhaar      # XXXX XXXX 1234
  - name: customer_email
    pii: medium
    mask: email        # r****@gmail.com
```

Masking applies at the **result serialisation boundary in `apps/api`** — before the result reaches the analysis prompt, before it reaches the client, before it reaches a report. Unmasked values must never leave the query executor.

Additionally: a regex sweep for Aadhaar, PAN, phone and email patterns in *unclassified* columns, as a backstop for a semantic layer that missed something. Log a warning when it fires — that's a signal to update the YAML.

Set `ColumnMeta.masked = true` so the UI can show a subtle indicator rather than silently lying about the data.

**Gate:** a test asserting that no unmasked PII value appears in any LLM request payload. Assert on the payload, not the response.

### 3.3 Reports

A report is an ordered `ReportBlock[]` — the model composes the *structure* (which sections, in what order, with what headings), the system fills each block with real computed content.

Export to PDF server-side with Puppeteer rendering a dedicated print stylesheet. This reuses the actual chart components, so the PDF matches the screen. Reject the temptation to build a parallel PDF rendering path.

Store reports in MongoDB; shareable read-only link.

### 3.4 Phase 3 exit gate

- [ ] Every number in the narrative traces to a computed `Insight` — verified by spot-checking 10 outputs
- [ ] PII never reaches an LLM payload (test)
- [ ] Injection row in seed data has no effect (test)
- [ ] PDF export matches on-screen rendering
- [ ] Analysis reads as useful to a non-technical person, not as a restatement of the chart

---

## PHASE 4 — Multilingual

### 4.1 Pipeline

```
raw question (any language, possibly code-mixed)
    ↓ detect language
    ↓ translate → canonical English question   ← SQL accuracy depends on this
    ↓ [Phase 1–2 pipeline, entirely in English]
    ↓ narrative generated directly in target language
    ↓ locale-aware number/date/currency formatting
```

**Translate to English before SQL generation.** Model SQL accuracy in non-English is materially worse, and the semantic layer is authored in English. Store both `rawQuestion` and `canonicalQuestion` on the `QueryPlan` so the user can see how their question was understood.

**Do not translate the narrative from English** — generate it natively in the target language. Translated analysis reads stiff and often mangles domain terms.

**Glossary pinning:** table names, metric names and product names must survive translation unchanged. Pass a do-not-translate list.

### 4.2 Code-mixing

Hinglish and romanised Hindi are the realistic input, not clean Devanagari. "pichle quarter ka sales dikhao" must work. Add code-mixed variants to the golden set — at least 8.

Language detection on short code-mixed strings is unreliable; prefer a cheap LLM classification call over a statistical detector, and allow a manual language selector as an override.

### 4.3 Locale formatting

For an Indian audience this is not cosmetic:

- Indian digit grouping (12,34,567 not 1,234,567) and lakh/crore where natural
- ₹ with correct placement
- DD/MM/YYYY
- Indian financial year (April–March) — if the business uses it, encode it in `policies.yml`, because "last year" then means something specific
- UI strings through i18next; RTL support if any target language needs it

### 4.4 Phase 4 exit gate

- [ ] Golden set translated into ≥ 3 languages; execution accuracy drops < 5 points vs English
- [ ] 8 code-mixed questions pass
- [ ] Narrative reads naturally to a native speaker, with domain terms intact
- [ ] Indian number, currency and date formatting correct throughout
- [ ] TTS voice selected per language, and the viseme map still produces plausible lip-sync (§ Phase A6 open question 6)

---

## PHASE 5 — Voice input and the latency problem

### 5.1 Capture

`MediaRecorder` or an `AudioWorklet` for PCM. Voice-activity detection for endpointing — end the turn after ~700ms of silence, with a manual stop always available. Show a live waveform so the user knows the mic is live.

Start with batch STT (record → send → transcribe). Move to streaming only if the latency work in §5.3 demands it.

### 5.2 Provider

Benchmark on **your own** audio, not published WER. Record 30 questions in Hindi, English and Hinglish, in a normal room, and score each provider. Deepgram leads on latency; Indic-specialist providers (Sarvam, AI4Bharat) typically win on code-mixed Hindi. The winner may differ per language — the STT layer should support per-language routing.

Keep this behind the same adapter pattern as the LLM.

### 5.3 Latency — design the perception, not just the number

The honest budget for a full turn:

| Stage | Realistic |
|---|---|
| STT | 300–600 ms |
| Translate + retrieve + SQL gen | 1.5–3 s |
| Query execution | 100–500 ms |
| Insight computation | < 50 ms |
| Narrative generation | 1–2 s |
| TTS first byte | 200–400 ms |
| **Total** | **4–7 s** |

Voice-agent guidance targets sub-second round trips. **You will not hit that, and chasing it will wreck the architecture.** Anything that queries a database and reasons about the result is in a different latency class than a chatbot. So make the wait legible and occupied:

1. **Immediate acknowledgement.** The moment the transcript is final, the avatar speaks a short pre-cached line in the right language ("Let me look that up") from a small bank of variants — zero API cost, ~200ms perceived response.
2. **Stage the visible progress.** Stream `TurnEvent`s: `understanding` → `querying` → `analysing` → `speaking`. The avatar plays the `thinking` gesture. The user sees the system working rather than a frozen face.
3. **Reveal the data before the speech.** Charts render as soon as the query returns — typically 2–3 seconds ahead of the narrative. The user is already reading while the avatar starts talking.
4. **Stream the narrative into TTS** in sentence-sized chunks so speech begins before generation finishes.

### 5.4 Barge-in

The user must be able to interrupt. On new speech detected while the avatar is speaking: stop audio immediately, cross-fade the gesture back to `idle`, cancel in-flight requests, return to `listening`. An avatar that talks over you is worse than a text box.

### 5.5 Phase 5 exit gate

- [ ] Full voice loop works in ≥ 3 languages
- [ ] Perceived response (acknowledgement audible) < 1s
- [ ] Full turn completes in < 7s at p90
- [ ] Barge-in works reliably
- [ ] STT benchmark results recorded in `docs/DECISIONS.md`
- [ ] Mic permission denial and STT failure have designed states

---

## PHASE 6 — Wiring the brain to the avatar

**This phase should be short.** If it isn't, the contract discipline from Phase A failed, and that's the finding — record it.

### 6.1 Orchestrator

`apps/api/src/orchestrator/` runs the turn state machine and emits `TurnEvent`s over SSE (WebSocket only if barge-in needs bidirectional signalling):

```
idle → listening → transcribing → planning → executing
     → analysing → speaking → idle
```

Every transition emits an event. Errors at any stage transition to a recoverable `speaking` state where the avatar explains the problem out loud — an error the avatar *says* lands far better than a red toast.

### 6.2 Gesture and emotion selection

Deterministic, from response metadata — not a separate model call:

| Condition | Gesture | Emotion |
|---|---|---|
| Greeting / session start | `greeting` | positive |
| Result contains a ranked list | `pointing` | neutral |
| Narrative includes a comparison or trend | `explaining` | neutral |
| Significant negative insight | `talking_emphatic` | concerned |
| Refusal / no data | `talking_neutral` | concerned |
| Default | `talking_neutral` | neutral |

### 6.3 Timeline coordination

The interesting part: the avatar should reference what's on screen. Split the narrative into segments, each optionally tagged with a chart element to highlight. As the viseme player passes a segment boundary, emit a highlight event to the data panel — the relevant bar pulses while the avatar talks about it.

This is the single feature that will make the demo look designed rather than assembled. Budget time for it.

### 6.4 Session memory

Store turns in MongoDB. Support follow-ups — "and by region?", "what about last year?" — by passing the previous `QueryPlan` as context to the planner. Cap at the last 5 turns.

**Gate:** a three-turn follow-up conversation resolves pronouns and implicit context correctly.

### 6.5 Phase 6 exit gate

- [ ] Ask aloud → avatar answers aloud with correct data on screen
- [ ] `apps/web/src/avatar/` required **zero or near-zero** changes — quantify it in the ADR
- [ ] Follow-up questions work across 3 turns
- [ ] Errors are spoken, not just displayed
- [ ] Chart highlighting syncs with speech

---

## PHASE 7 — Demo mode, hardening, and ship

The phase most people skip, and the one that determines whether this project gets you interviews.

### 7.1 Demo mode  *(build this first in the phase)*

`NETRA_MODE=demo`: 10 curated questions with fully pre-baked `SpeechPacket`s, query results, charts and analyses, stored as fixtures. **Zero API calls, zero cost, zero latency, cannot break.**

This is what a recruiter or hiring manager hits from your README. Live mode sits behind a key or a rate-limited allowance. Without this, your first traffic spike either costs you real money or shows a broken demo.

### 7.2 Cost and abuse controls

- Per-IP and per-session rate limits
- Daily spend ceiling; on breach, fail over to demo mode rather than erroring
- Token and cost logged per request, attributed to a stage
- Prompt-cache hit rate tracked — the schema prefix should be cached on nearly every call
- Kill switch: one env var disables all paid calls

### 7.3 Observability

Structured logs with a trace ID per turn, carrying stage timings, token counts, retrieval hits, SQL generated, validation outcome, and cost. A simple `/admin/metrics` page showing p50/p90 latency by stage and daily spend is a genuine differentiator in a portfolio project — it shows you think about operating software, not just writing it.

### 7.4 Security review

Work the checklist explicitly and write up the results:

- [ ] Read-only role enforced at the database; app validation as second layer
- [ ] Adversarial SQL suite green
- [ ] PII never in an LLM payload
- [ ] Result content treated as untrusted (injection test green)
- [ ] No secrets in the repo or the client bundle
- [ ] Rate limits and spend caps live
- [ ] CORS locked to known origins
- [ ] Dependency audit clean

### 7.5 Deployment

| Component | Target |
|---|---|
| `apps/web` | Vercel or Cloudflare Pages |
| `apps/api` | Railway, Render, or Fly.io |
| Postgres | Neon or Supabase (free tier is sufficient for the demo dataset) |
| MongoDB | Atlas free tier |
| 3D assets + audio fixtures | CDN / object storage, Draco-compressed, long cache headers |

Health checks, a cold-start warmer if the API tier sleeps, and CI deploying on merge to `main`.

### 7.6 Documentation — the actual deliverable

The README is the product for this audience. Structure:

1. **A 30–60 second demo GIF at the very top.** Voice question in Hindi → avatar speaks → chart appears. Captions burned in so it reads with sound off. This one asset does more work than the rest of the README combined.
2. One-paragraph problem statement — who this is for and why they can't use a BI tool.
3. Architecture diagram (Excalidraw or Mermaid).
4. **The interesting engineering, written up honestly:** the semantic layer, two-stage retrieval, the AST guardrail including the CTE-write attack, code-computed insights vs. model-narrated prose, the frozen `SpeechPacket` contract and why the avatar was built first, the eval harness and its numbers.
5. Eval results — actual accuracy figures. Publishing a real number, even an imperfect one, signals more competence than any adjective.
6. Cost model — per-interaction economics.
7. Local setup that works from a clean clone.
8. **Known limitations and what you'd do next.** Non-negotiable. Every senior reviewer looks for this section, and its absence reads as not knowing where the edges are.

Also: `docs/DECISIONS.md` with the full ADR trail, and a short blog post or thread — the write-up travels further than the repo.

### 7.7 Final exit gate

- [ ] Demo mode works from a clean clone with no API keys
- [ ] Deployed and publicly reachable
- [ ] Demo GIF in the README
- [ ] Eval numbers published
- [ ] Security checklist complete and documented
- [ ] Limitations section written honestly
- [ ] Spend cap verified by triggering it

---

## Cross-cutting: cost model

Steady-state per full voice interaction, at current pricing:

| Component | Cost |
|---|---|
| STT (~10s) | ~$0.001 |
| Translation + SQL generation (cached schema prefix) | ~$0.006 |
| Narrative generation | ~$0.006 |
| TTS (~400 chars) | ~$0.007 |
| **Total** | **~$0.02** |

Development across Phases 1–7, assuming disciplined caching and heavy use of demo fixtures: **$40–80 total**. Live public demo: **$15–25/month**, hard-capped.

Two structural notes. First, prompt caching on the schema prefix is the largest single lever — cache reads are a fraction of base input price and your prefix is identical on nearly every call. Second, Gemini's current Flash pricing is introductory and **doubles on 1 January 2027**; keep the LLM adapter clean so re-pricing is a config change, and re-run your cost model before then.

---

## Cross-cutting: what to keep testing

Permanent test suites, never weakened:

1. Read-only permission enforcement (Phase 0)
2. Adversarial SQL rejection, 25 cases (Phase 2)
3. PII absence from LLM payloads (Phase 3)
4. Prompt-injection inertness (Phase 3)
5. `pnpm eval` execution accuracy (Phase 1, re-run every phase)

Run all five in CI. When accuracy drops after a change, you'll know within minutes rather than discovering it in a demo.

---

## Cross-cutting: the four ways this project fails

Worth re-reading at the start of each phase.

1. **Skipping the semantic layer.** Wiring the raw schema straight into a prompt works on toy questions and collapses on real ones. If accuracy is poor, the fault is almost always here, not in the prompt.
2. **Letting the model do arithmetic.** Every hallucinated number destroys the trust of exactly the non-technical user this is built for. Compute in code, narrate with the model.
3. **No eval harness.** Without one you are tuning prompts by vibes, you cannot tell improvement from regression, and you have no number to publish.
4. **Polishing the avatar instead of shipping.** The avatar is done at the end of Phase A. Later phases may touch gestures and sync, nothing more. Every additional hour spent on the character is an hour not spent on the part that makes the project worth showing.
