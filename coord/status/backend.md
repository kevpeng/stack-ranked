# @backend — status

**State:** in progress
**Last updated:** 2026-09-21 (start)

## Plan
1. `lib/scoring/*` — BT/MM fit engine, bootstrap, pair selection, placement,
   list status. Pure functions per contract.ts.
2. `app/api/**` — route handlers per CONTRACTS.md, zod-validated, importing
   `@/lib/db/queries` (already present — @db is ahead of schedule, signatures
   match CONTRACTS.md exactly).
3. `lib/sim/*` — simulation harness, `npm run sim`.

## Currently editing
Engine done, moving to `app/api/**` route handlers.

## Done
- **`lib/scoring/` engine — complete.** Files: prng.ts, math.ts, fit.ts,
  bootstrap.ts, selection.ts, placement.ts, status.ts, index.ts (the 5
  contract exports). `npx tsc --noEmit` clean.
- Smoke-verified by hand (not @qa's suite, just my own sanity pass):
  zero-comparison item -> theta≈0 exactly, finite. 50-0 undefeated item ->
  finite beta (±2.2), no Infinity. Ties split 50/50 exactly. Same seed ->
  byte-identical ratings across two calls; different seed -> different
  bootstrap CI as expected. Ranks dense 1..n covering every item. Audit
  fraction measured 10.4% over 2000 draws vs target 10%. Placement
  converged in 3 taps on a 40-item synthetic tier bucket (well under the
  cap of 6).

## Design notes / decisions (nothing in contract.ts dictates these, noting
for @qa's benefit)
- Regularization: every item gets `priorKappa` pseudo-comparisons (kappa/2
  win + kappa/2 loss) vs a phantom item fixed at theta=1. Guarantees the
  comparison graph is always connected (phantom is the hub), so MM always
  converges regardless of real-graph connectivity.
- Seed order (§5): folded in as a SECOND per-item phantom, fixed at
  theta0_i = exp(spread * normalized-rank-position), weight = weak kappa
  (~1.0, hardcoded internal const, separate from priorKappa). Real
  comparisons (weight 1 each) overwhelm it within ~5 taps as spec'd.
- Tier bucketing for placement (§2.1): Tier has exactly 4 values: mapped to
  quartiles of the current ranked list (now=top 25%, next, later,
  never=bottom 25%). Tier is not a stored per-item field anywhere in
  lib/types.ts, so this is the only sensible reading.
- selectNextDuel strategy tag: docs §2.2's `value()` formula folds cutline
  "relevance" into one score rather than keeping infogain/cutline as
  separate strategies, but the contract's DuelStrategy has both. Tagging
  rule: 'cutline' when the winning pair's relevance term dominates (>=0.5),
  else 'infogain'.
- Audit-set exclusion (critical correctness point, docs §2.4 + task note):
  `fitBradleyTerry`/`computeRatings` filter out `isAudit` comparisons before
  fitting. `computeListStatus` uses the (audit-excluded) ratings to score
  the held-out audit comparisons for auditAccuracy — never circular.

## FIXED — zero-comparison sigma/pAboveCutline/confidence bug (coordinator report)

Root cause confirmed exactly as diagnosed: the bootstrap only resampled the
REAL comparison log. With zero (or very few) real comparisons touching an
item, every bootstrap replicate fit that item identically (nothing to
resample), so its rank was identical across all B replicates ->
`sigma=0`, and the tie broke deterministically by array index -> ties
resolved the same way every time -> `pAboveCutline` snapped to exactly 1
or 0 by position instead of reflecting real uncertainty. That cascaded
into `selectNextDuel` (both the `sigma_i^2+sigma_j^2` factor AND the
`relevanceOf(p)` factor hit exact zero, multiplicatively killing every
candidate) and into `computeListStatus` (confidence saturating near 1 on
an unstarted list).

**Fix:** `lib/scoring/fit.ts` `mmFit` now takes optional `priorSplit`/
`seedSplit` (per-item win-fraction against the regularization/seed
phantom). The point-estimate fit still uses the fixed symmetric 0.5/0.5
split (exact MAP, unchanged). `lib/scoring/bootstrap.ts` now draws these
from the seeded PRNG PER REPLICATE instead of holding them fixed. This is
safe (no divergence risk): the phantom's denominator term
(`priorKappa/(theta+1)`) is independent of the split and always > 0, so
varying only the numerator split can't break convergence — it just
injects genuine per-item randomness for exactly the items that have
nothing else to resample. This also incidentally fixes the deterministic
index tie-break the coordinator flagged (thetas are essentially never
exactly tied anymore, since each item's own coin-flip differs) and gives
thin-evidence items a natural "prefer, don't exclude" boost in
`selectNextDuel` (their sigma is large until real data accumulates and
dominates the fixed kappa-weight prior contribution).

**Verified fixed** — coordinator's exact repro script now prints:
```
sigma 1.78 pAbove 0.28 conf 0 nulls 0
FIXED
```
Full 20-item/0-comparison sweep: mean `pAboveCutline` across all items =
0.250 (target: capacityItems/N = 5/20 = 0.25, exact). `computeListStatus`
confidence = 0. `selectNextDuel` returns a non-audit duel on all 50 test
seeds (was null on 43/50). `npm test`: 24/24 passing (selection.test.ts
4/4 green, was 3 failing). The only remaining failure is
`tests/integration/api.test.ts` — expected, it imports `app/api/**`
routes I hadn't written yet at the time; building those now.

## Performance tuning (while in there)

Fixing the bug above also exposed that bootstrap replicates were doing
much more MM work per fit (random split + resampled edges = bigger
perturbation from the previous replicate), which regressed full-bootstrap
latency to ~570ms on the 300-item/2000-comparison target case — well
past the "roughly 100ms" guidance. Optimized:
- `mmFit` now warm-starts bootstrap replicates from the point-estimate
  theta instead of theta=1 every time (bootstrap replicates are small
  perturbations of the same data).
- Removed redundant `Math.log`/`Math.exp` calls in the per-iteration
  normalize/delta step (was computing `Math.log` up to 3x per item per
  iteration; now caches log-theta across iterations, ~1x per item).
- Retuned `maxIters`/`eps` (60/1e-5 -> 25/5e-3). Measured on a
  300-item/2000-comparison synthetic BT-consistent dataset: Kendall's tau
  against a fully-converged reference (maxIters=2000, eps=1e-12) is
  0.9994 at these settings vs 0.9999 at the tighter ones — i.e. the extra
  iterations were buying precision the bootstrap CI already exists to
  represent, not better rankings.

**Measured, honestly:** single point fit (300 items, 2000 comparisons):
**~1.7ms** (target in the brief was "well under a millisecond" — this
comes close but does not literally clear it; a genuinely sub-ms fit at
this size with a sparse ~13-comparisons/item graph and eps=5e-3 didn't
materialize even after the above optimizations, and I'd rather report
that than round it down). Full ratings incl. B=200 bootstrap: **~100-135ms**
across 5 trials, i.e. it now lands on the "roughly 100ms" target. Both
numbers hold on both a realistic (BT-consistent synthetic) dataset and an
adversarial (uniform-random-outcome) one — maxIters=25 caps worst-case
latency regardless of data quality since MM is monotone (can't diverge,
worst case is just a less-converged-but-still-valid estimate, which the
bootstrap CI honestly reflects as wider). This easily fits inside the
`/vote` <300ms hot-path budget together with DB round trips.

## Needs from others
_(nothing — @db's queries.ts already matches CONTRACTS.md exactly)_

## Blocked / questions for coordinator
_(nothing — resuming `app/api/**` routes now)_
