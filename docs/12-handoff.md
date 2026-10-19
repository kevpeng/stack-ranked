# 12 — Handoff: picking this up locally

Everything you need to go from `git clone` to ranking your own Linear backlog.
Verified end to end from a clean clone on 2026-10-19.

---

## 1. Get it running (4 commands)

**Requires Node ≥ 20.12** (the Linear scripts use `--env-file-if-exists`).

```bash
git clone -b claude/feature-prioritization-gamify-7a47dj \
  https://github.com/kevpeng/stack-ranked
cd stack-ranked
npm ci
npm run db:seed     # 60-item demo backlog, prints a list id
npm run dev         # http://localhost:3000
```

**No database to install, no credentials.** With `DATABASE_URL` unset the app
runs [PGlite](https://pglite.dev) — real Postgres compiled to WASM —
persisting to `./.pglite/`. The schema self-creates on first connection, so
there is never a migration to run. `npm run db:seed` is idempotent; re-run it
any time to reset.

Then open the printed URL and **use the keyboard**: `←`/`→` to pick,
`space` for "too close to call", `s` to skip. Do 30–40 duels, then visit
`/lists/<id>/diff` — that is the payoff and it needs some duels behind it.

## 2. Connect your real Linear backlog

```bash
echo 'LINEAR_API_KEY=lin_api_...' >> .env.local   # gitignored
npm run linear:check                              # verifies key, lists teams
npm run linear:import -- --team ENG
```

Create the key at **Linear → Settings → Security & access → Personal API
keys**. Linear shows it once, so copy it whole. Full options and the
reasoning for a personal key over OAuth are in
[10](10-running-and-deploying.md).

`linear:check` reports, per team, how many open issues have a **usable
description**. Expect that number to be lower than you'd like — it is the
honest first signal about backlog hygiene, and issues without one are skipped
because a duel card needs a judgeable one-liner.

## 3. Everyday commands

```bash
npm run dev          npm test            npm run typecheck
npm run build        npm run db:seed     npm run sim          # ~25 min
npm run linear:check npm run linear:import -- --team KEY
```

## 4. Codebase map

```
lib/types.ts          domain types + DEFAULT_PARAMS (source of truth)
lib/scoring/          BT/MM fit, bootstrap, decay, pair selection, placement
  contract.ts         the signatures the engine implements
lib/db/               drizzle schema, dual-driver client, queries, fixtures
lib/linear/           personal-key client, issue fetch/mapping, check, import
lib/sim/              simulation harness (synthetic voter, 5 experiments)
app/api/              8 route handlers -> Vercel functions. No separate server
app/lists/[id]/       duel session, list view, diff, unplaced queue
components/           DuelCard, EvidenceChips, ProgressBar, Chip
tests/                36 tests: property, recovery, selection, db, API
coord/CONTRACTS.md    API shapes + query-layer signatures
docs/11-decisions.md  every decision in one place — read this first
```

## 5. Things that will bite you

**Four invariants. Each is load-bearing and each is easy to break by accident.**

1. **Never show rank or score on a duel card.** Anchoring — see it's #3, pick
   #3, and the model re-learns its own output, silently poisoning the data.
   There is a test enforcing it. ([01](01-product-spec.md), [03](03-gamification.md))
2. **Never UPDATE or DELETE a comparison.** The log is append-only and
   everything else is derived from it. Corrections are new rows.
3. **Undefeated and winless items must stay finite.** Bradley-Terry's MLE does
   not exist for them, and *every item is in that state on its first
   placement*. The prior pseudo-comparisons in `lib/scoring` exist solely for
   this. Four tests cover it. ([02 §3.2](02-ranking-model.md))
4. **Never clear `lists.seedOrder`.** It looks like an onboarding artifact; it
   powers the seed-vs-settled diff, which is the product's best moment.

**Other traps:**

- **The engine must stay deterministic given a seed.** No bare `Math.random()`
  anywhere in `lib/scoring` — there is a seeded PRNG.
- **The audit set must stay excluded from the fit**, or its accuracy
  measurement is circular and meaninglessly high.
- **Don't judge the ranking by whole-list Spearman.** Random selection beats
  adaptive on it *by design*, because cut-line focus deliberately starves
  non-boundary items. A health metric must be restricted to the cut-line
  neighbourhood. ([09](09-simulation-findings.md))
- **Neon's HTTP driver has no transactions.** `db.transaction()` throws at
  runtime; the query layer avoids it.
- **PGlite is single-connection.** It runs in-memory under vitest so parallel
  workers don't contend. Don't point tests at the on-disk instance.

## 6. Known issues (not yet fixed)

From the simulation harness — read [09](09-simulation-findings.md) before
trusting any convergence number:

| Issue | Impact |
|---|---|
| **Confidence never reaches 90%** | The metric demands `P(above cut line) > 0.95`, unreachable for genuinely tied items. A real list plateaus ~0.73–0.85 forever and the progress bar never completes |
| **A session can't re-ask a contested pair** | `staleness` collapses a just-asked pair's score to ~0 *and* the `notRecent` filter excludes it. With a 90-day half-life, every comparison in a minutes-long session counts as "recent" |
| **The "~180 duels" claim is unsupported** | No list size hit the target within 5–15× the predicted budget |
| **No authentication** | Anyone with the URL can read and vote |
| **90-day decay leans wrong** | Quiet on stable lists, nearly unresponsive to real churn |

**The engine itself is sound** — rank recovery hits Spearman 0.93–0.99 against
ground truth. The defects are in the stopping rule and progress metric layered
on top, which is a far cheaper problem.

## 7. What to do next

1. **Fix the stopping rule** — start with the never-re-ask rule in
   `lib/scoring/selection.ts`. Cheapest fix, largest expected effect. Then
   redefine "settled" against *decision stability* (would more comparisons
   change the decision?) rather than posterior extremity, and surface genuine
   ties as a result: *"these four are equivalent, pick by cost"* is a better
   output than a forced total order.
2. **Use it on your own backlog for a week.** The real test is whether the
   diff tells you something you didn't know.
3. **Authentication**, before this goes anywhere shared.
4. **Re-derive the duel budget** from the corrected metric, then update
   [00](00-vision.md) and the README.

## 8. Deploying

Vercel, with one hard requirement: **PGlite will not work there.** It persists
to the local filesystem and Vercel's is ephemeral per-invocation, so every
request would get its own empty database. Set `DATABASE_URL` to Neon or Vercel
Postgres. Full steps in [10](10-running-and-deploying.md) — note that path is
not verified end to end.

## 9. Where the reasoning lives

[11 — Decision log](11-decisions.md) is the index; start there. Underneath it:
[00](00-vision.md) vision · [01](01-product-spec.md) product spec ·
[02](02-ranking-model.md) the model · [03](03-gamification.md) gamification ·
[04](04-integrations.md) integrations · [05](05-architecture.md) architecture ·
[06](06-roadmap.md) roadmap · [07](07-open-questions.md) open questions ·
[08](08-multiplayer-later.md) multiplayer (parked) ·
[09](09-simulation-findings.md) simulation findings ·
[10](10-running-and-deploying.md) running & deploying.
