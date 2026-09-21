# @qa — status

**State:** DONE (all 4 deliverables written; one high-severity bug found and
reported below, not fixed — per instructions)
**Last updated:** 2026-09-21

## Deliverables

1. `tests/unit/scoring.properties.test.ts` — 11 property tests: dominant
   item ranks first, reversed log reverses order, ties produce no confident
   ordering, determinism, decay (old vs recent), rank-interval sanity, audit
   exclusion, and 4 finiteness tests (undefeated / winless / zero-comparison
   / "every item on first placement"). **10 pass, 1 fails — genuine bug, see
   below.**
2. `tests/unit/scoring.recovery.test.ts` — ground-truth recovery test, 16
   items, ~85%-accurate simulated voter, asserts Spearman rho > 0.8 between
   fitted rank and true rank. **Passes** (rho comes out well above 0.8).
3. `tests/unit/selection.test.ts` — 4 tests for `selectNextDuel`:
   auditFraction over many draws, determinism, no repeated ask of a settled
   pair, null when confidently settled. **2 pass, 2 fail — same root bug as
   above.**
4. `tests/unit/db.test.ts` — 8 round-trip tests against `lib/db/queries.ts`
   (create/get/list, placed/unplaced, insert/read comparisons,
   `recentDuplicateComparison`, append-only export check). **All 8 pass.**
5. `tests/integration/api.test.ts` — 11 tests against the 8 routes in
   CONTRACTS.md: create+fetch, no rank/score in `Duel`, vote moves
   ratings/comparisonCount, double-submit guard, diff sanity, 5x bad-input
   4xx cases. **Currently red at import time** — `app/api/**` hasn't landed
   yet (@backend status: "moving to app/api/** route handlers" as of last
   check). This is 100% "not built yet", not a defect — see "Assumptions"
   below for what it needs once routes land.
6. `tests/helpers/{factories,random,http}.ts` — shared fixture builders, a
   seeded PRNG (mulberry32) + Spearman correlation, and Next-15
   route-handler test helpers. No `fast-check`/`simple-statistics` in
   `node_modules`, so these are hand-rolled per instructions (never ran
   `npm install`).

`npx tsc --noEmit`: clean except the 7 `Cannot find module '@/app/api/...'`
errors in `api.test.ts`, which will resolve once @backend lands those files.

`npm test` (current, stable across repeated runs against the persisted
PGlite store): **3 failed / 21 passed** of 24 collected tests, plus
`api.test.ts` failing to collect (0 tests) for the reason above.

---

## HIGH-SEVERITY BUG — found via the tests above, not fixed (not my file)

**A freshly created (or lightly-evidenced) list is reported as ~100%
confident and `selectNextDuel` can never produce a real duel for it.** This
is the exact regression class docs/02 §3.2 and the task brief call out as
"the single most likely production bug" — my tests hit it from three
independent angles.

### Repro (ran directly against `lib/scoring`, not through my test suite —
see `/tmp/.../scratchpad/probe_*.mjs` for the exact scripts, reproducible
from any 20-item, zero-comparison list):

```
computeRatings({ items: 20 fresh items, comparisons: [], capacityItems: 8, ... })
  -> every rating has sigma = 0.000000 (bit-identical across all 200 bootstrap
     replicates) and pAboveCutline is a HARD 1.0 for items 0-7, 0.0 for items 8-19
     (pure array-index artifact, not real confidence)

computeListStatus({ ratings, comparisons: [], ... })
  -> { confidence: 1, comparisonCount: 0, placedCount: 20, unplacedCount: 0,
       auditAccuracy: null }
  This directly contradicts docs/02 §5.3: "Show 'Seeded — 0% confident' ...
  until ~2 comparisons per item exist. A confident-looking list built from
  priors is the fastest way to lose trust on day one." A brand-new list
  reports 100% confident, not 0%.

selectNextDuel called 400x (varying seed) on that same fresh list:
  -> { nullCount: 357, auditCount: 43, otherCount: 0 }
  Zero non-audit duels EVER. Only the ~10% audit-fraction draws return
  anything. The onboarding session (the entire product loop, docs/03) cannot
  start on a fresh list.
```

Same failure mode, independently, for a log of pure ties (6 items, all pairs
tied 3x): `pAboveCutline` comes back exactly `1.0` for 3 items and `0.0` for
the other 3 (should show no confident ordering — theta *is* correctly flat,
spread < 1e-9, but the derived confidence is not).

### Root cause (my reading of `lib/scoring/bootstrap.ts` + `fit.ts` +
`selection.ts` — not verified against @backend's own reasoning, just what
the code does):

1. `mmFit`'s fixed point for **any item whose real evidence is symmetric**
   (zero comparisons, or comparisons that are all ties) is *exactly*
   `theta = 1` for every such item — and, importantly, this fixed point does
   **not depend on which edges the bootstrap resample happened to draw**,
   because a tie/no-op edge's win-fraction is fixed at `0.5` (or absent
   entirely) regardless of resample multiplicity. So every one of the 200
   bootstrap replicates converges to the *bit-identical* theta vector →
   `sigma = 0` for those items (`lib/scoring/bootstrap.ts`, the
   `betaSum`/`betaSqSum` variance calc).
2. With `theta` bit-identical across all replicates, `argsortDescending`
   (`lib/scoring/fit.ts`) breaks every tie the same way in every replicate —
   its tiebreak is `a - b` (array index) — so the "rank" of a tied item is
   the *same fixed number* in all 200 replicates, not a random draw from the
   tied block. That turns what should be a wide, honest rank interval into
   `rankLo === rank === rankHi` and `pAboveCutline` snapped to a hard `0` or
   `1` purely by array position.
3. `selectNextDuel`'s cutline weighting (`relevanceOf(p) = 1 - |2p - 1|`,
   `lib/scoring/selection.ts`) is exactly `0` at `p = 0` or `p = 1`. Since
   step 2 makes `pAboveCutline` hit one of those two exact values for nearly
   every item in a lightly-evidenced list, `relevance` (and therefore
   `value = entropy * uncertainty * relevance * staleness * comparability`)
   is exactly `0` for **every** infogain/cutline candidate pair. `maxValue <
   VALUE_EPS` then triggers the "nothing worth asking" path, so the
   non-audit branch returns `null` unconditionally — the audit branch is the
   only surviving code path (it's chosen *before* any of this, via
   `rng() < auditFraction`, so it's unaffected).

This is not the "theta diverges to Infinity" bug DASHBOARD.md warns about —
theta itself stays correctly finite and near-0 (that part is right, and my
finiteness tests pass). It's a different regression in the *same danger
zone*: the bootstrap's uncertainty estimate collapses to false certainty
whenever real evidence doesn't structurally break the symmetry between
items, which is precisely the first-placement / cold-start case docs/02
§3.2 says is "the common case, not an edge case."

### Impact if shipped
- `ListStatus.confidence` reads 100% on a brand-new or barely-touched list —
  the opposite of the documented cold-start UX (docs/02 §5.3).
- `selectNextDuel` cannot produce an infogain/cutline duel for such a list —
  only ~10% audit-strategy duels, forever. The ~180-duel onboarding session
  (docs/03, the whole product) cannot get started from a fresh list.
- Any maintenance-mode item that's gone quiet (few/no recent comparisons)
  would likely show the same false high-confidence + never get re-asked,
  which also breaks the decay/re-ask loop (docs/02 §3.4, §6).

### Where I'd look (not my call to fix)
- `argsortDescending` tiebreak in `lib/scoring/fit.ts` and how it's used
  per-replicate in `lib/scoring/bootstrap.ts` — ties within a single
  bootstrap replicate need some randomized/jittered break so that a
  genuinely-tied block of items gets a genuinely-spread rank interval
  across replicates, not the same fixed order every time.
- Possibly: give zero/symmetric-evidence items a floor on `sigma` (e.g. from
  the prior) rather than letting true bootstrap variance of exactly 0 stand
  in for "no uncertainty."

### Failing tests that demonstrate this (all in `tests/**`, already committed
to this session's work, none modified to hide the bug):
- `tests/unit/scoring.properties.test.ts` → `a log of only ties produces no
  confident ordering`
- `tests/unit/selection.test.ts` → `honours auditFraction roughly, over many
  draws, on a fresh list` (expected >360/400 non-null, got 43)
- `tests/unit/selection.test.ts` → `does not repeatedly return an
  already-settled pair while unresolved pairs exist` (expected some
  non-audit picks among 200 draws on an 8-item list with only 1 settled
  pair, got 0 — because the other 6 fresh items all hit the bug above)

I did **not** touch `lib/scoring/**` to fix this — it's @backend's file and
the coordinator's call per DASHBOARD.md RULE 1/4.

---

## Everything else (non-bug reds)

- `tests/integration/api.test.ts`: red purely on `Cannot find module
  '@/app/api/...'` — @backend hasn't landed `app/api/**` yet. Nothing else
  can be assessed here until then. **Assumption baked into this file,
  flagged inline in a comment at the top:** since CONTRACTS.md doesn't fully
  pin down whether a freshly-created (fixture-seeded) list offers a duel
  immediately or requires driving every item through `/place` first, my
  `ensureDuel()` helper tries the direct route first and falls back to a
  bounded `/place` + `/vote` loop per unplaced item. If neither works once
  routes land, that's either a genuine wiring gap or my assumption is wrong
  — re-read the fallback logic in `api.test.ts` before assuming it's a
  backend defect.
- Also note: given the bug above, once `app/api/vote` calls into
  `selectNextDuel` for `nextDuel`, a fresh list's `POST /vote` response will
  likely have `nextDuel: null` far more often than expected — that's the
  same root cause surfacing through the API, not a separate API bug.

## Needs from others
- `lib/scoring/index.ts` (landed) — see bug report above.
- `app/api/lists/**`, `app/api/lists/[id]/**` route handlers from
  @backend — still not landed as of this update; `api.test.ts` is ready and
  will go green (or surface real defects) as soon as they exist.

## Blocked / questions for coordinator
None — nothing here blocks continued work; the bug above is informational
for the coordinator to route to @backend.
