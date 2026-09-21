# 05 — Architecture

## Sizing first

One PO: ~5 lists × up to 300 items, maybe 5,000 comparisons a year. A Bradley–Terry MM fit over 300 items with 2,000 comparisons converges in **well under a millisecond**; 200 bootstrap resamples lands in ~100ms.

**There is no scale problem, and single-player removes the one piece of machinery that looked like one** (the online/batch scoring split — see below). The engineering difficulty is entirely in integrations ([04](04-integrations.md)) and in making a ~180-duel session pleasant. Any decision that trades simplicity for scale is a mistake.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Web + API | **Next.js (App Router) + TypeScript** | One deploy; server components suit the list view |
| DB | **Postgres** (Neon or Supabase) | Relational, transactional, RLS for tenancy |
| ORM | **Drizzle** | Typed, thin, SQL-shaped |
| Jobs | **Inngest** (or BullMQ + Redis) | Sync and reconcile only — *not* scoring |
| Auth | **Auth.js** | Tracker OAuth is the login. Defer WorkOS/SSO until it's asked for |
| Hosting | **Vercel** + managed Postgres | |
| Scoring | **TypeScript, inline in the request** | See below |

**Scoring stays in TypeScript and stays in-process.** MM for Bradley–Terry is ~30 lines of arithmetic with no matrix algebra and guaranteed monotone convergence; the bootstrap is a loop. A Python service for `scipy`/`choix` would add a second language, a second deploy, and a network hop inside the hot path for a numerically trivial problem.

---

## The simplification single-player buys

The multiplayer design needed online Elo for instant feedback plus a nightly batch fit for correctness, a refit queue, and a job scheduler for scoring. **All of that is gone.**

One voter's data is small enough to **refit synchronously inside the vote request, on every tap.**

```
POST vote
  ├─ validate (list membership, duel not stale)        ~2ms
  ├─ INSERT comparison   (append-only, never updated)  ~5ms
  ├─ refit BT (MM, converged)                          <1ms
  ├─ bootstrap B=200 → rank CIs, P(above cut line)    ~100ms
  ├─ score next duel from the candidate set            ~3ms
  └─ respond with new ranks + next duel         ◀── ~110ms total
```

What this deletes: the Elo implementation, the entire dual-system divergence bug class, the refit queue, the scoring scheduler, cache invalidation on fit completion, and every "why does the UI disagree with the API" question. **The rank shown after a tap *is* the authoritative rank.** No reconciliation, ever.

If the bootstrap ever gets tight on a 300-item list, the escape hatch is to run it every 5th tap and interpolate confidence between — not to reintroduce a batch system.

---

## Services

```
┌───────────────────────────────────────────────────────────┐
│  Next.js app                                              │
│   ├─ web UI (duel session, list, unplaced, diff, settings)│
│   ├─ /api/vote        validate → insert → refit → respond │
│   ├─ /api/webhooks/*  linear (verify → enqueue → 200)     │
│   └─ scoring/         MM fit, bootstrap, pair selection   │
└──────────────────┬────────────────────────────────────────┘
                   │ enqueue (sync only)
┌──────────────────▼────────────────────────────────────────┐
│  Worker                                                   │
│   ├─ sync.ingest      webhook → upsert item               │
│   ├─ sync.reconcile   every 5 min, cursor-based backstop  │
│   ├─ apply.writeback  chunked, resumable order push       │
│   └─ notify.nudge     daily (Phase 2)                     │
└──────────────────┬────────────────────────────────────────┘
                   ▼
              Postgres
```

Webhook handlers **verify, enqueue, return 200 immediately.** Never process inline — providers retry aggressively on slow responses, producing duplicate work at exactly the wrong moment.

No Redis in Phase 1: no rate limits to enforce (one user), no hot-read caching needed at this size.

---

## Data model sketch

```sql
-- Identity ----------------------------------------------------
organizations  (id, name, plan, created_at)
users          (id, org_id, email, name, created_at)

connections    (id, org_id, provider,          -- linear | jira
                external_workspace_id, access_token_enc,
                refresh_token_enc, expires_at, scopes,
                sync_cursor, status, last_error_at)

-- Mirrored tickets --------------------------------------------
items          (id, org_id, connection_id, provider, external_id,
                external_key,                  -- ENG-123, display only
                title, summary_line,           -- duel-card line (generated/edited)
                url, labels jsonb, team_key, project_key,
                external_priority, external_estimate, external_sort_order,
                state, state_type,             -- active | completed | canceled
                requester_name, evidence jsonb,-- ARR, customers, links
                created_at_external, updated_at_external,
                synced_at, deleted_at)
                UNIQUE (connection_id, external_id)

-- Lists -------------------------------------------------------
lists          (id, org_id, owner_id, name,
                filter jsonb,                  -- Linear filter / JQL
                tier_config jsonb, capacity_points, capacity_items,
                decay_halflife_days, writeback_mode,  -- manual | auto
                seed_order jsonb,              -- KEPT FOREVER: powers the
                                               -- seed-vs-settled diff
                confidence_pct, created_at)

list_items     (id, list_id, item_id, tier, placed_at, frozen)
                UNIQUE (list_id, item_id)
                -- absence of placed_at ⇒ the Unplaced queue

-- The event log (source of truth, append-only) -----------------
comparisons    (id, list_id, voter_id,         -- voter_id: see note below
                item_a_id, item_b_id,
                outcome,                       -- a | b | tie
                strategy,                      -- placement | infogain
                                               -- | cutline | audit
                is_audit bool,                 -- held out of the fit
                latency_ms, position_in_session,
                created_at)
                -- NEVER UPDATE. Corrections are new rows.
                INDEX (list_id, created_at), (item_a_id), (item_b_id)

skips          (id, list_id, item_a_id, item_b_id, created_at)

-- Derived state ------------------------------------------------
ratings        (id, list_id, item_id, theta, sigma,
                rank, rank_lo, rank_hi,        -- bootstrap CI
                score_0_100, comparison_count,
                p_above_cutline, computed_at)
                UNIQUE (list_id, item_id)

-- Process -------------------------------------------------------
pins           (id, list_id, item_id, target_rank, reason,
                active, created_at)
applications   (id, list_id, provider, order_before jsonb,
                order_after jsonb, status, applied_at, reverted_at)
sessions       (id, list_id, user_id, kind,    -- onboarding | maintenance
                started_at, completed_at, duel_count, abandoned_at)
audit_log      (id, org_id, actor_id, action, target_type, target_id,
                before jsonb, after jsonb, created_at)
```

### Four decisions worth defending

**1. `comparisons` is append-only and never mutated.** Everything else — ranks, scores, confidence — is derived and fully reproducible. This buys replaying history after a model change, answering "why is this #3" with actual evidence, running the harness against real data, and recovering from any scoring bug without data loss. Storage cost is nothing.

**2. Keep `voter_id` even though there's exactly one voter.** It costs a column now and makes [08](08-multiplayer-later.md) an *additive feature* rather than a schema migration across the only table that can't be regenerated. The cheapest forward-compatibility decision available; skipping it would be the expensive kind of clever.

**3. `ratings` is a single current row per item, not versioned snapshots.** The multiplayer design versioned every fit to explain week-over-week movement across a changing roster. Single-player doesn't need it — the comparison log replays exactly, so any historical rank is recomputable on demand. Simpler table, no `rating_runs`, no snapshot bloat.

**4. `lists.seed_order` is kept forever.** It looks like a onboarding artifact to clean up. It isn't — it powers the seed-vs-settled diff, which is the product's best moment ([03 §1](03-gamification.md)) and a primary validation metric ([02 §7](02-ranking-model.md)).

---

## The simulation harness (build this first)

Before any integration works: synthetic items with known ground-truth θ, a synthetic voter with configurable noise, drift, **fatigue** (accuracy decaying through a long session), and occasional self-contradiction. Replay the pipeline.

It answers in minutes, for free, what would otherwise cost months of real usage:
- duels-to-confident at N = 60 / 150 / 300 — does the [02 §1](02-ranking-model.md) table survive realistic noise?
- infogain vs. random — the actual multiplier
- **what decay half-life keeps a stable backlog quiet while flagging a churning one** — the hardest parameter to guess and the one the maintenance loop depends on
- does late-session fatigue measurably corrupt a ~180-duel sitting? If so, cap it

Highest-leverage week in the project: pure TypeScript, zero dependencies, zero integrations, and it doubles as the permanent regression suite for the scoring engine.

---

## Observability

Product health is loop health:

- **Median time per duel** (target 4–6s; >10s means cards lack context, <2s means tapping blind)
- **Onboarding completion rate** and **abandonment position** — the single most important Phase 1 number. If everyone quits at duel 70, the session is too long
- **Time-per-duel drift within a session** — the fatigue signal
- **Confidence trajectory** per list, and decay-driven return rate
- **Audit-set accuracy** — the honesty check; alarm near chance
- **Seed-vs-settled divergence** — near zero across users is a kill signal ([07](07-open-questions.md))
- Sync lag, webhook failures, token expiry, Apply success rate

---

## Testing

- **Scoring engine:** property tests — a dominant item ranks first; a reversed log reverses the order; ties leave the order unchanged; **undefeated items stay finite** (the [02 §3.2](02-ranking-model.md) regression that will otherwise bite in production on the very first placement).
- **Golden fixtures:** frozen comparison logs → expected rankings, so model changes produce a reviewable diff.
- **Integrations:** recorded HTTP fixtures; live smoke test against a sandbox workspace in CI.
- **Apply:** explicitly test the chunked/resumable path against partial failure — Jira's rank API will produce it in production.
