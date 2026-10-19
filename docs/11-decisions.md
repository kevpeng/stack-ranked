# 11 — Decision Log

Everything settled so far, in one place, with pointers to the detail. Read this
before writing code; read the linked docs when you need the reasoning.

> **Start here: the MVP is already built.** Engine, API, UI, tests and a
> simulation harness are all in and passing (`1fbabd0`). You are not starting
> from zero — see [§6](#6-what-is-already-built) for what exists and
> [§7](#7-where-to-start) for the live work.

---

## 1. Product decisions

| Decision | Why | Detail |
|---|---|---|
| **Single-player: one PO owns the list** | Rescoped from multiplayer. One person is ~85–90% self-consistent vs a committee's ~80%, so fewer comparisons AND no coordination problem. Deleted vote weights, rosters, consensus, anti-gaming, identity mapping | [00](00-vision.md), [08](08-multiplayer-later.md) |
| **Ranking is single-player, intake is not** | Anyone can file into the Unplaced queue; only the PO ranks. Keeps the wedge tight while making triage useful | [01](01-product-spec.md) |
| **One axis: "which ships first?"** | Bundles value and cost, which is the actual decision. Avoids RICE's decomposition and its ambiguity | [01](01-product-spec.md) |
| **Scoped lists (20–150 items), never the whole backlog** | A security chore vs a marketing experiment is an unanswerable question; asking it produces noise that pollutes the model | [01](01-product-spec.md) |
| **Never show rank or score on a duel card** | Anchoring. See it's #3, pick #3, model re-learns its own output. Silently destroys the data; enforced by a test | [01](01-product-spec.md), [03](03-gamification.md) |
| **Coarse tier before binary insertion** | Now/Next/Later/Never cuts placement from ~6 taps to ~4. `Never` is a one-tap archive — backlogs grow because nothing has a cheap "no" | [02 §2.1](02-ranking-model.md) |
| **Seeded items arrive PLACED** | Unplaced is for post-creation arrivals only. Getting this wrong left `placedCount: 0` and onboarding could never start (fixed in `46aec8d`) | [01](01-product-spec.md) |
| **The cut line is the most important UI element** | Turns an abstract ordering into "these four ship, these don't" | [01](01-product-spec.md) |
| **Seed-vs-settled diff is the payoff** | "Your stored order and your judgement disagree on 34 of 61 items" — lands in the first session, free from keeping `seedOrder` | [03 §1](03-gamification.md) |
| **Keyboard-first** | `←`/`→` pick, `space` tie, `s` skip. The difference between finishing a long session and quitting at 40 | [01](01-product-spec.md) |
| **Web-first; Slack is a Phase 2 nudge** | Inverted from the multiplayer plan — a focused keyboard session can't happen in a chat card, and the PO already lives in their tracker | [04](04-integrations.md) |
| **Advisory output, explicit Apply** | Never auto-write to the tracker. Single ownership makes auto-apply *offerable*, never the default | [00](00-vision.md), [04](04-integrations.md) |
| **Gamification judged on information per tap, not taps** | Rejected: vote-count goals, request points, badges, leaderboards. Kept: confidence progress, decay as invitation, zero-inbox, movers | [03](03-gamification.md) |
| **No LLM prioritization, ever** | The pitch is human judgement efficiently elicited. A model guessing at priority is the thing being replaced. LLMs may summarize cards; they don't rank | [00](00-vision.md) |

## 2. Model decisions

| Decision | Why | Detail |
|---|---|---|
| **Separate elicitation from aggregation** | Binary insertion decides *what to ask*; Bradley-Terry decides *what to believe*. Conflating them (Beli's literal array) makes one early misclick permanently unrecoverable | [02](02-ranking-model.md) |
| **Bradley-Terry via Hunter's MM** | ~30 lines, no gradients, no step size, guaranteed monotone convergence | [02 §3.1](02-ranking-model.md) |
| **Keep BT even with one voter** | An array has nowhere to put self-inconsistency, no confidence signal (so staleness is invisible), and no way to know a March placement has aged. Those three *are* the maintenance loop. Closest call in the design | [02 §3.0](02-ranking-model.md) |
| **Prior pseudo-comparisons against a phantom item** | **The critical invariant.** Undefeated items drive θ→∞, winless →0, MLE doesn't exist — and every item is in that state on its first placement. Not an edge case | [02 §3.2](02-ranking-model.md) |
| **Ties count as half a win each** | Simple and sufficient. Davidson's tie model only if ties exceed ~20% | [02 §3.3](02-ranking-model.md) |
| **Bootstrap (B=200) for rank intervals** | Yields *rank* CIs directly, which is what the UI shows. Chosen over analytic Fisher information | [02 §4](02-ranking-model.md) |
| **No Elo, no batch jobs — synchronous refit per tap** | One voter's data fits in <1ms, so the rank shown after a tap *is* authoritative. Deletes the dual-system divergence bug class entirely | [05](05-architecture.md) |
| **Cut-line focus** | Precision below the line is worthless — #41 vs #48 changes nothing | [02 §2.3](02-ranking-model.md) |
| **~10% audit holdout, excluded from the fit** | The only honest accuracy measure on an adaptively-sampled dataset. Including it makes the measurement circular | [02 §2.4](02-ranking-model.md) |
| **Comparisons are append-only; ratings are derived** | Never UPDATE or DELETE a comparison. Everything else recomputes from the log, so "why is this #3" is always answerable | [05](05-architecture.md) |
| **`voterId` in the schema from day one** | Costs a column; makes multiplayer additive rather than a migration on the one unregenerable table | [05](05-architecture.md), [08](08-multiplayer-later.md) |
| **`seedOrder` kept forever** | Looks like an onboarding artifact. It powers the diff — the product's best moment | [05](05-architecture.md) |

### Current parameters (`lib/types.ts` is the source of truth)

```ts
noiseBeta: 0.45    priorKappa: 1.5       decayHalflifeDays: 90
bootstrapB: 200    auditFraction: 0.1    maxPlacementTaps: 6
confidentHi: 0.95  confidentLo: 0.05
```
All were guesses; [§5](#5-decisions-measurement-invalidated) says which the harness has now challenged.

## 3. Technical decisions

| Decision | Why |
|---|---|
| **Next.js App Router + TypeScript, on Vercel** | One deploy for app and API |
| **API = route handlers under `app/api/**`. No separate backend server** | They deploy as Vercel functions automatically. Viable *because* scoring is synchronous and there's no worker to host |
| **Drizzle on `pg-core`, dual driver** | `DATABASE_URL` set → Neon; unset → PGlite on disk. Runs with zero credentials while staying Postgres-accurate |
| **PGlite in-memory under vitest** | Parallel workers sharing one on-disk data dir crashed PGlite's WASM runtime intermittently |
| **Scoring in TypeScript, in-process** | MM is trivial arithmetic. A Python/scipy service would add a language, a deploy and a network hop in the hot path |
| **Tailwind, hand-rolled components** | No component library |
| **Ratings derived per request, not stored** | Sub-ms fit; a cache would only add invalidation work |

## 4. Deliberately NOT built

Tracker OAuth (Linear/Jira), order write-back, **authentication** (single hardcoded dev voter), Slack, stored `ratings` table, pins, undo/applications, audit log, seasons, effort lists. See [coord/MVP-PLAN.md](../coord/MVP-PLAN.md) and [06](06-roadmap.md).

## 5. Decisions measurement invalidated

**Read [09](09-simulation-findings.md) before trusting any convergence number.** The harness contradicted the design:

- **The duel budget is unsupported.** `docs/02 §1` predicted ~100 duels for a 60-item cut line; no list size reached 90% confidence within 5–15× that. N=60 self-terminated at 1,334 duels, stuck at 0.733. **The "~180 duels in one sitting" claim in [00](00-vision.md)/README is not established.**
- **The confidence metric is unachievable by construction.** It demands `P(above cut line) > 0.95`, but items genuinely tied in value never get there — the uncertainty is irreducible, not statistical. It conflates "haven't measured enough" with "these are equivalent."
- **Top fix, cheapest, likely largest effect:** in `lib/scoring/selection.ts` a just-asked pair scores ~0 twice over (`staleness` collapses it, and the `notRecent` filter excludes it). With a 90-day half-life and a session lasting minutes, *every* prior comparison is "recent" — so contested cut-line pairs can never get a confirming second look.
- **Infogain beats random ~2×, not 3–5×** (437 vs 837 duels to 70% confidence at N=60). Directionally right, numerically optimistic.
- **Global Spearman is a trap metric.** Random beats adaptive on it *by design* — cut-line focus starves non-boundary items. Any health dashboard must restrict to the cut-line neighbourhood.
- **Fatigue costs ~0.10 Spearman** → cap session length.
- **The 90-day decay default leans the wrong way** — quiet on stable lists but nearly unresponsive to real churn (+0.045 vs +0.26 for 30-day).

**What is NOT broken: the engine.** Rank recovery hits Spearman 0.93–0.99 against ground truth. The defect is the stopping rule and progress metric layered on top.

## 6. What is already built

| Area | State |
|---|---|
| Scoring engine (`lib/scoring`) | BT/MM fit, prior, bootstrap CIs, decay, seeded PRNG, pair selection (placement/infogain/cutline/audit), placement probing |
| API (`app/api`) | All 8 routes from [coord/CONTRACTS.md](../coord/CONTRACTS.md) |
| Frontend (`app`, `components`) | Duel session, list view with cut line, diff, unplaced queue, home |
| Database (`lib/db`) | Schema, dual-driver client, 10-function query layer, 60-item fixture backlog |
| Tests (`tests`) | 36 passing — property, ground-truth recovery, selection, DB, API contract |
| Simulation harness (`lib/sim`) | Synthetic voter with fatigue/bias, 5 experiments |

Verified: `tsc` clean, 36/36 tests, seed runs with no credentials, `next build` succeeds, and a live 220-vote session drove confidence 0.067 → 0.500 with a real diff.

## 7. Where to start

In descending value:

1. **Fix the stopping rule and confidence metric** ([09](09-simulation-findings.md)). Start with the never-re-ask rule — a session lasting minutes shouldn't be governed by a half-life measured in months. Then redefine "settled" against *decision stability* (would more comparisons change the decision?) rather than posterior extremity, and surface genuine ties as a result: *"these four are equivalent, pick by cost"* is a better output than a forced total order. This unblocks the progress bar ever reaching 100%.
2. **Linear integration** ([04](04-integrations.md)) — the spike checklist is the first 2 days. Needed before real data.
3. **Authentication** — currently anyone with the URL can read and vote.
4. **Re-derive the duel budget** from the corrected metric, then update [00](00-vision.md)/README.

## 8. Still open

- **Linear or Jira first?** → Linear (cleaner API, float `sortOrder`, no LexoRank). Inverts if your design partners are on Jira.
- **Is "which ships first" really one question?** Unresolved — [02 §6](02-ranking-model.md) measures intransitivity and recommends splitting a list when cycles spike.
- **Pricing**, and **company vs. personal tool** — the latter changes how much of [04](04-integrations.md)'s security work is required. See [07](07-open-questions.md).
