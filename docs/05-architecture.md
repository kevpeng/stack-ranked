# 05 — Architecture

## Sizing first, so we don't over-build

Per organization, realistically: ~50 ladders × ~200 items, ~20 voters, on the order of **100k comparisons per year**. A Bradley–Terry MM fit over a 200-item ladder with 10k comparisons converges in **single-digit milliseconds**; 200 bootstrap resamples is still under a second.

**There is no scale problem here.** Postgres and a worker process cover it to hundreds of customers. The engineering difficulty is entirely in integrations ([04](04-integrations.md)) and in getting the loop to feel instant. Any architecture decision that trades simplicity for scale is a mistake at this stage.

---

## Stack recommendation

| Layer | Choice | Why |
|---|---|---|
| Web + API | **Next.js (App Router) + TypeScript** | One deploy for app and API; server components suit a read-heavy ladder view |
| DB | **Postgres** (Neon or Supabase) | Relational data, needs transactions, RLS for tenancy |
| ORM | **Drizzle** | Typed, thin, SQL-shaped — matters because the scoring queries are aggregate-heavy |
| Jobs | **Inngest** (or BullMQ + Redis self-hosted) | Sync, fits, digests, scheduled DMs; durable retries are non-negotiable for webhook processing |
| Cache / limits | **Redis** | Rate limits, session state, hot ladder reads |
| Auth | **WorkOS** or **Auth.js** | SSO expected by the buyer; don't build it |
| Hosting | **Vercel** + managed Postgres | |
| Scoring | **TypeScript, in the worker** | See below |

**Scoring stays in TypeScript.** The temptation is a Python service for `scipy`/`choix`. Resist it: MM for Bradley–Terry is ~30 lines of arithmetic with no matrix algebra and guaranteed monotone convergence, and the bootstrap is a loop. A second language means a second deploy, a second dependency tree, and a network hop inside the hot path — for a numerical problem that is genuinely trivial. (If we later want per-voter noise EM or a hierarchical model, revisit. Not before.)

---

## Services

```
┌────────────────────────────────────────────────────────────────┐
│  Next.js app                                                   │
│   ├─ web UI (ladder, duel, disagreement map, admin)            │
│   ├─ /api/slack/*      interactions, commands, events          │
│   ├─ /api/webhooks/*   linear, jira  (verify → enqueue → 200)  │
│   └─ /api/v1/*         public API (phase 3)                    │
└───────────────┬────────────────────────────────────────────────┘
                │ enqueue
┌───────────────▼────────────────────────────────────────────────┐
│  Worker                                                        │
│   ├─ sync.ingest         webhook → upsert item                 │
│   ├─ sync.reconcile      every 5 min, cursor-based backstop    │
│   ├─ score.refit         BT MAP + bootstrap → ratings snapshot │
│   ├─ duels.generate      refresh candidate pair queue          │
│   ├─ notify.daily        per-user local-morning DM             │
│   ├─ notify.digest       weekly requester + ladder digest      │
│   └─ apply.writeback     chunked, resumable order push         │
└───────────────┬────────────────────────────────────────────────┘
                ▼
        Postgres  ·  Redis
```

**Webhook handlers verify, enqueue, and return 200 immediately.** Never process inline — providers retry aggressively on slow responses and you get duplicate work under exactly the load where you least want it.

---

## The hot path: a vote must feel instant

This is the one latency budget that matters. A Slack button press should visibly resolve in well under a second.

```
POST vote
  ├─ validate (rate limit, roster membership, duel not stale)   ~5ms
  ├─ INSERT comparison  (append-only, never updated)            ~5ms
  ├─ online Elo update on both items                            ~1ms
  ├─ pop next duel from the precomputed queue                   ~2ms
  ├─ respond to Slack / client                            ◀── <100ms total
  └─ async: enqueue refit if ≥25 new comparisons since last
```

Two decisions make this work:

1. **Duel queues are precomputed.** Pair scoring ([02 §2.2](02-ranking-model.md)) runs in a job, not in the request. Each voter has a short queue of their next pairs, refreshed after fits and on roster/item changes. Reading the next duel is a single indexed row read.
2. **Elo front-runs the batch fit.** Movement is visible immediately; the authoritative Bradley–Terry fit lands within a minute. When they disagree, the batch fit wins silently. A persistent large divergence is a bug alarm, not a display problem.

---

## Data model sketch

Not final DDL — the shape, and the decisions worth arguing about now.

```sql
-- Tenancy ------------------------------------------------------
organizations   (id, name, plan, created_at)
users           (id, org_id, email, name, role, avatar_url,
                 slack_user_id, tracker_account_id, weight_default,
                 status)                      -- invited | active | disabled

connections     (id, org_id, provider,        -- linear | jira | slack
                 external_workspace_id, access_token_enc,
                 refresh_token_enc, expires_at, scopes,
                 sync_cursor, status, last_error_at)

-- Mirrored tickets ---------------------------------------------
items           (id, org_id, connection_id, provider, external_id,
                 external_key,                -- ENG-123, display only
                 title, summary_line,         -- generated/edited duel-card line
                 description_excerpt, url,
                 labels jsonb, team_key, project_key,
                 external_priority, external_estimate, external_sort_order,
                 state, state_type,           -- active | completed | canceled
                 requester_user_id, evidence jsonb,  -- ARR, customers, links
                 created_at_external, updated_at_external,
                 synced_at, deleted_at)
                 UNIQUE (connection_id, external_id)

-- Ladders ------------------------------------------------------
ladders         (id, org_id, name, axis,      -- ship_first | effort
                 filter jsonb,                -- JQL or Linear filter
                 tier_config jsonb, capacity_points, capacity_items,
                 season_id, settled_pct, status, created_by)

ladder_items    (id, ladder_id, item_id, tier, frozen,
                 added_at, removed_at)
                 UNIQUE (ladder_id, item_id)

ladder_members  (id, ladder_id, user_id, weight, role_override,
                 muted, joined_at)

-- The event log (append-only, the source of truth) -------------
comparisons     (id, ladder_id, voter_id,
                 item_a_id, item_b_id,
                 outcome,                     -- a | b | tie
                 strategy,                    -- insertion | infogain | cutline
                                              -- | challenge | audit
                 is_audit bool,               -- held out from selection
                 latency_ms, position_in_session, client,
                 coi_flag, weight_applied,
                 created_at)
                 -- NEVER UPDATE. Corrections are new rows.
                 INDEX (ladder_id, created_at), (voter_id), (item_a_id), (item_b_id)

duel_responses  (id, ladder_id, voter_id, item_a_id, item_b_id,
                 kind,                        -- skip | need_context
                 created_at)                  -- informative, not a comparison

-- Derived state (versioned snapshots, always recomputable) -----
rating_runs     (id, ladder_id, method_version, params jsonb,
                 comparison_count, started_at, finished_at,
                 settled_pct, audit_accuracy, cycle_ratio)

ratings         (id, rating_run_id, ladder_id, item_id,
                 theta, sigma, rank, rank_lo, rank_hi,   -- bootstrap CI
                 score_0_100, elo, comparison_count,
                 p_above_cutline, disagreement_index)

role_ratings    (id, rating_run_id, ladder_id, item_id, role,
                 rank, n_voters)              -- powers the disagreement map

-- Process ------------------------------------------------------
requests        (id, org_id, requester_id, ladder_id, item_id,
                 problem, evidence jsonb, dedupe_of_item_id,
                 status, created_at)

challenges      (id, ladder_id, item_id, challenger_id, reason,
                 rank_before, rank_after, status, opened_at, resolved_at)

overrides       (id, ladder_id, item_id, user_id, target_rank,
                 reason, active, created_at, revoked_at)

applications    (id, ladder_id, user_id, provider,
                 order_before jsonb, order_after jsonb,
                 status, applied_at, reverted_at)   -- enables real Undo

-- Engagement ---------------------------------------------------
sessions        (id, ladder_id, user_id, started_at, completed_at,
                 duel_count, source)          -- slack | web
streaks         (user_id, current, longest, last_session_date, freezes_left)
audit_log       (id, org_id, actor_id, action, target_type, target_id,
                 before jsonb, after jsonb, created_at)
```

### The three decisions worth defending

**1. `comparisons` is append-only and never mutated.** Everything else — ranks, scores, Elo, settled % — is derived and reproducible from it. This buys: replaying history after a model change, answering "why is this #3" with the actual evidence, running the [02 §7](02-ranking-model.md) simulation harness against real data, and recovering from any scoring bug without data loss. The cost is storage, which is nothing.

**2. Ratings are versioned snapshots, not mutable columns on `items`.** `rating_runs` records the method version and parameters. When the model changes, old rankings remain explainable instead of silently rewritten, and week-over-week movement is a join instead of a changelog we have to remember to write.

**3. Overrides are separate rows, not edits to rank.** The model's answer and the human's answer coexist and are both visible. This is the [00](00-vision.md) positioning made structural: the PM overrules the ladder without erasing what the ladder said.

---

## Scoring pipeline

```
comparison INSERT
    │
    ├─▶ Elo update (inline, both items)
    │
    └─▶ if new_comparisons_since_fit ≥ 25  OR  nightly
            │
            ▼
        score.refit(ladder)
            1. load comparisons, apply weights × time decay
            2. exclude audit-set rows from the fit
            3. MM iterate to convergence (+ prior pseudo-comparisons)
            4. bootstrap B=200 → rank CIs, σ, P(above cut line)
            5. per-role fits → role_ratings (disagreement map)
            6. metrics: settled %, audit accuracy, cycle ratio
            7. INSERT rating_run + ratings (new snapshot)
            8. enqueue duels.generate; invalidate cache
            9. emit events: upsets, cut-line crossings, resolved challenges
```

Step 2 matters and is easy to get wrong: **the audit set must be excluded from the fit** or its accuracy measurement is circular and meaninglessly high.

---

## The simulation harness (build this first)

Before a single integration works, build a harness that generates synthetic ladders, synthetic voters (with configurable bias, noise, laziness, and bad faith), and replays the full pipeline.

It answers, in minutes and for free, questions that would otherwise take a quarter of real usage:
- duels-to-settled at N = 30 / 60 / 150 and 5 / 10 / 20 voters
- infogain vs. random selection — the real multiplier, not the estimated one
- distortion from one bad-faith voter at weight 1.0, and at what weight it stops mattering
- whether time decay causes oscillation
- whether the settled % metric behaves monotonically enough to show a user

Every parameter in [02 §9](02-ranking-model.md) is currently a guess. This turns them into measurements. It is the highest-leverage week of engineering in the whole project, it's pure TypeScript with no external dependencies, and it doubles as the regression suite for the scoring engine forever.

---

## Observability

Product health *is* loop health. Instrument the loop, not just the servers:

- **median time per duel** (target < 6s; > 10s means the cards lack context, < 2s means people are tapping blind)
- **session completion rate** (started 5, finished 5)
- **mid-session drop-off position** (if everyone quits at duel 4, the cap is 3)
- `need_context` and `skip` **rates per ladder** — the best available proxy for ticket hygiene
- **settled % trajectory** per ladder
- **audit-set accuracy** per ladder — the honesty check; alarm if it approaches chance
- **cycle ratio** — flags incoherent ladders
- sync lag, webhook failure rate, token expiry, Apply success rate

---

## Testing

- **Scoring engine:** property tests (a dominant item ranks first; a reversed comparison log reverses the order; ties leave the order unchanged; undefeated items stay finite — the §3.1 regression that will absolutely bite otherwise).
- **Golden fixtures:** frozen comparison logs → expected rankings, so model changes produce a reviewable diff.
- **Integrations:** recorded HTTP fixtures; a live smoke test against a sandbox workspace in CI.
- **Apply:** the chunked/resumable path must be tested against partial failure explicitly, because Jira's rank API will produce it in production.
