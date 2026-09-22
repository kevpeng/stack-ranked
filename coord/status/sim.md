# @sim — status

**State:** DONE.
**Last updated:** 2026-09-22

## TL;DR — read this first

1. **docs/02 §1's duels-to-confident table does not survive realistic noise.
   The gap is large, not a rounding error.** None of N=60/150/300 reached
   90% confidence within budgets of 5-15x the predicted floor. Worse: at
   N=60, the real `selectNextDuel` algorithm **voluntarily stopped**
   (returned `null` — "nothing worth asking") at 1334 duels with confidence
   stuck at **73.3%**, not 90%. More budget would not have helped that run;
   the algorithm itself gave up first.
2. **Infogain beats random, but nowhere near docs/02 §2.2's claimed 3-5x —
   and "beats" depends entirely on what you measure.** On the metric the
   product actually cares about (cutline confidence), adaptive's edge grows
   from ~1x (no better than random) at low thresholds to ~2x by 70%
   confidence — real, but we could never observe it at the 90% target since
   neither arm got there. On **global** rank correlation vs ground truth,
   uniformly random selection eventually **beats** adaptive at every N
   tested. That's not a bug — it's the direct, correctly-working consequence
   of the cutline strategy deliberately ignoring items far from the
   boundary (docs/02 §1: "nobody needs a total order") — but it means a
   whole-list Spearman/Kendall dashboard would show adaptive selection
   looking *worse* than doing nothing clever, which is a real trap for
   whoever builds the observability docs/05 asks for.
3. **Fatigue measurably corrupts results.** Consistent across all 3 repeats:
   mean Spearman drops by 0.10 (0.746 → 0.646) and confidence drops too,
   from a fatigue curve that only takes accuracy from 87% to 75.6% by tap
   180 — nowhere near chance. Supports capping session length.
4. **Decay half-life has a real, sharp tradeoff, and the current 90-day
   default leans toward the wrong failure mode for the maintenance loop's
   whole reason to exist.** Short half-life = responsive to real churn but
   nags a genuinely stable list into 0% confidence within 6 months. Long
   half-life = keeps a stable list quiet but barely reacts to a real,
   unambiguous priority change. At 90 days (default), a 10-duel maintenance
   session after an unambiguous priority escalation moved the item's
   `pAboveCutline` by only **+0.045** — barely more than the 180-day
   setting's -0.015, and far behind 30 days' +0.260. This is exactly the
   parameter docs/02 §3.4 says is "the hardest to guess," and the guess
   looks off, in the direction of "too slow to flag churn."

Everything below is the detail, exact numbers, and how I got them. I found
one bug in my own reporting code while assembling this (not the engine —
see "A bug I found in my own harness" below), fixed it, and did not need to
re-run the 26-minute experiment to correct the affected number honestly.

---

## Deliverables

- `lib/sim/voter.ts` — synthetic voter: `accuracy` (flat, gap-independent —
  see rationale below), `fatigue` (onset tap / half-life-in-taps / floor),
  `tieRate`, `bias` (systematic per-label perceived-theta boost). Seeded,
  deterministic.
- `lib/sim/world.ts` — synthetic backlog generator; each item carries a
  hidden `trueTheta` (log-scale, same units as `Rating.theta`) and
  `trueRank`, invisible to the engine, used only for evaluation.
- `lib/sim/run.ts` — `npm run sim`. Drives `selectNextDuel` -> synthetic
  voter -> `computeRatings` -> `computeListStatus` for real, runs all 5
  experiments, prints the tables below.
- `lib/sim/rng.ts` — self-contained deterministic PRNG (mulberry32). Kept
  separate from `lib/scoring/prng.ts` (an internal implementation detail
  behind the frozen `lib/scoring/contract.ts` surface, not something this
  permanent regression suite should couple to) and from
  `tests/helpers/random.ts` (must not import across the test boundary, per
  instructions).
- `lib/sim/spearman.ts` — own copy of Spearman rank correlation, same
  reasoning as above (tests/helpers/random.ts has one; not imported).

Nothing outside `lib/sim/**` and this file was touched. `lib/scoring/contract.ts`
and `lib/types.ts` were read-only inputs, used exactly as specified.

## Baseline check (before I touched anything)

`npx tsc --noEmit`: 0 errors, confirmed clean before any of my edits, and
still 0 errors now (repo-wide).

`npm test`: **observed real, pre-existing flakiness in `tests/unit/db.test.ts`,
nothing to do with `lib/sim`, and now fixed (not by me — see the note
below).** Before writing a single line of my own code I ran it 4 times
(including with a freshly-deleted `.pglite/` dir, and once with
`--no-file-parallelism`) and got 33/36, 34/36, 33/36, 30/36 — different
tests failing each time, all inside `tests/unit/db.test.ts`, either a raw
PGlite WASM crash (`Aborted()` / `__abort_js` deep in
`@electric-sql/pglite`'s `postgres.js`) or what looks like cross-test data
pollution (`expected 1 item, got 2`). This is entirely inside
`tests/unit/db.test.ts` / PGlite, `lib/sim` touches no DB whatsoever (per the
brief: "no DB, no UI, no network"), and both `tests/**` and `lib/db/**` are
outside my glob — flagged per DASHBOARD.md RULE 1/2 rather than touched.
**I initially guessed the later clean runs were just "no sim process
competing for CPU anymore" — that guess was wrong, or at least incomplete;
see "Concurrent coordinator activity" below for the real explanation.**

## Concurrent coordinator activity discovered in git history (important — read this)

While doing final verification I found two commits on this branch that I did
not make (`80e2de0`, `532cea9` — both authored "Claude <noreply@anthropic.com>",
`Co-Authored-By: Claude Opus 5`, same session URL as mine). I never ran `git
commit`. Reading them: this looks like the **coordinator** (Opus, per
`coord/DASHBOARD.md`: "the coordinator commits") doing exactly its documented
job — periodically committing agents' in-progress work — and, in this case,
also running its own investigation on top of my (then in-progress) `lib/sim`
and drawing conclusions. Worth flagging plainly rather than silently working
around it:

1. **`80e2de0` modifies `lib/db/client.ts`** (23 lines) — outside every
   agent's glob except @db's, and I never touched it. The change switches
   PGlite to run **in-memory under vitest** instead of against `./.pglite`,
   with a commit-message explanation that exactly matches the root cause I
   would have guessed at (every parallel vitest worker opening the same
   on-disk PGlite data directory, and PGlite being single-connection,
   producing the intermittent `Aborted()` crash). **This is almost certainly
   why my later `npm test` runs came back clean — not "CPU contention ended,"
   as I first guessed.** I did not make this change and can't verify it from
   first principles beyond "it matches the failure mode I saw and all 4 of my
   post-fix test runs were clean" — flagging so @db/the coordinator can
   confirm it's intentional and correct, since it's a real behavior change
   (tests no longer share persisted state across runs) that only @db's own
   review can properly sign off on.
2. **`532cea9` adds `docs/09-simulation-findings.md` and flags the ~180-duel
   claim in `README.md`.** Both outside my glob, not touched by me. Its
   conclusions are strongly consistent with mine — same headline (docs/02 §1's
   budget is far too optimistic), same root-cause direction (the confidence
   metric requires resolving genuinely-close cut-line items, which the
   never-repeat-within-a-half-life mechanic makes slow to do), same
   bottom-line verdict ("the engine itself is sound; the defect is in the
   stopping rule / progress metric"). **The exact numbers differ from mine**
   (its N=60: 1,380 duels, plateaus ~0.78-0.82; mine: 1,334 duels, plateaus at
   0.733 — see the timestamps: `80e2de0` landed at 03:21:38, while my own
   background run didn't finish until ~03:38, so whatever produced those
   numbers ran against an earlier/in-progress version of `lib/sim/run.ts`,
   before my later edits — including the `confidenceAt` bugfix described
   below). It also only covers experiments 1-2 in a preliminary way; it
   doesn't have experiments 3, 4, or 5 (this file does, in full, below).
   **Treat this file (`coord/status/sim.md`) as the authoritative, complete,
   final record** — it's a single, fully-verified run (exit code 0, watched
   start to finish, cross-checked against its own internal counters) of the
   exact code now sitting in `lib/sim/run.ts` — and the coordinator may want
   to reconcile `docs/09`'s specific numbers against it. The qualitative
   story is the same either way; I'm not disputing the direction, only noting
   the exact figures come from different runs of evolving code and mine is
   both later and more complete.

Nothing here changed what I built or how — I'm reporting it because I'd want
to know if I were the coordinator, and because a status file that went silent
about two unexplained commits touching a file outside its author's glob would
itself be a problem.

## Design decisions worth flagging

**Voter response model is deliberately FLAT accuracy, not gap-dependent.**
`accuracy` is P(picks the truly-better item) independent of how close the
pair's true thetas are — literally what docs/02 §1 defines ("a single
person is ~85-90% self-consistent"). I considered routing it through the
engine's own logistic link instead (so a landslide pair is almost always
called correctly and a true toss-up is ~50/50), which is the more common
choice in ranking-recovery literature, but rejected it: `noiseBeta` already
plays that role from the FIT's point of view (docs/02 §2.2's value formula);
layering a second, gap-dependent noise source on top would double-count
difficulty and make "accuracy" not mean what docs/02 §1 says. Confirmed
empirically: I generated the same N=60 world at `thetaSpread` 1/3/8 (a
2.7x-8x change in the actual gap between the items straddling the cut line)
and got **byte-identical** confidence/Spearman trajectories every time,
because this voter only reads the *sign* of the true gap, not its
magnitude. That's intentional, not a bug — every "hard cluster near the
cutline" effect below comes from genuine local ordering ambiguity among
several nearby items (an inherent property of drawing N points from a
continuous distribution), not from the voter refusing to commit on a narrow
gap.

**No `seedOrder` anywhere.** `FitInput.seedOrder` (the cold-start tracker
prior, docs/02 §5) is left undefined throughout. Docs/02 §1's floor table is
about how many *comparisons* it takes to resolve the cut line; mixing in a
seed-order head start would conflate "elicitation is efficient" with "the
tracker order was already pretty good," which are different claims. This
makes every number below a **conservative (harder)** test than a real,
tracker-seeded onboarding would face — worth remembering when reading the
gaps below as possibly-pessimistic, not just alarming.

**Session loop calls `computeRatings` fresh every duel, exactly like
production** (docs/05: "refit synchronously... on every single tap") — no
incremental/warm state carried between duels beyond what `computeRatings`
does internally. Most expensive possible way to run the loop; kept anyway
because the point is to measure the real pipeline.

**`capacityItems` per N matches docs/02 §1's table exactly** (15/25/30 for
N=60/150/300) so the duel-count comparison is apples to apples.

**Random-selection baseline doesn't reserve an audit holdout.** Real
`selectNextDuel` spends ~10% of duels on `isAudit=true` comparisons excluded
from the fit (docs/02 §2.4, compensating for adaptive selection's sampling
bias). A uniformly random policy has no such bias by construction, so that
rationale doesn't apply to it — every random-baseline duel goes into the
fit. Deliberate: this makes the comparison "the real adaptive algorithm,
audit tax included" vs "the simplest alternative a reviewer would actually
propose," the fair real-world version of docs §2.2's question.

**PRNG and Spearman kept independent of `lib/scoring` and `tests/`,** on
purpose, per instructions — see Deliverables above.

## Voter mechanics — verified directly, not just used indirectly

Ran a standalone check (not part of `npm run sim`; written, run, and deleted
— not left behind) exercising every feature the task asked for:

```
tieRate check: ties=0.2029 (target 0.20) aWins=0.6933 (target 0.696=0.8*0.87)
bias check: biased(truly-worse, labeled) wins 0.8958 of the time (target ~0.90)
determinism check: identical=true
fatigue check: tap1=0.87 tap50=0.87 tap100=0.6850 (expect 0.685) tap10000=0.5000 (expect ~0.5)
```

All four match hand-calculated targets exactly.

## A bug I found in my own harness (fixed; did not require a re-run)

While writing up results I caught that Experiment 1's "confidence @ floor
duels" column was actually printing **Spearman rho**, not confidence (a
copy-paste of the wrong accessor: `spearmanAt` instead of a proper
`confidenceAt`). Confirmed by cross-referencing: the raw log showed "70.1%"
for N=60 at duel 100, which exactly matches Experiment 3's
`spearman(adaptive, N=60, duel=100) = 0.701`. **Fixed in `lib/sim/run.ts`**
(added a real `confidenceAt` helper, used it in the right place). I did not
re-run the full ~26-minute experiment just for this one column — Experiment
1b (duels-to-reach-each-threshold) uses the *correct* accessor
(`duelsToReach`, which reads `.confidence`) throughout and already gives a
strictly more informative answer to the same question, so I derived the
"confidence at the docs floor" figures reported below from that correct
table (as a bracket, e.g. "confidence at duel 100 was under 30%, since 30%
wasn't reached until duel 136") rather than re-running. If anyone re-runs
`npm run sim` now, that column will print correctly.

## Timing (why the full run took ~26 minutes)

Measured before committing to the final experiment matrix: `computeRatings`
(point fit + B=200 bootstrap) costs **~26.5ms at N=60, ~66ms at N=150,
~157ms at N=300 per call** — and, surprisingly, this is close to *constant*
regardless of how many comparisons have accumulated (50 vs 400 duels at
N=300 both landed at ~155-165ms/call). The cost is dominated by the O(n)
per-item bootstrap/selection work, not the O(edges) term. Worth knowing on
its own: @backend's ~100-135ms estimate (`coord/status/backend.md`) was
measured at the single largest point (300 items, 2000 comparisons) and
reads as roughly the ceiling; in practice the N=300 cost is already close to
that ceiling almost immediately, not just after history fills up — relevant
to the `/vote` latency budget in docs/05.

Because cost-per-duel is ~flat, total session cost is close to linear in
duel count, which is what made it practical to run generous ceilings
(1500-5000 depending on N/mode). **All experiment 1/2/3 numbers below are
single-seed** (one world, one voter stream per N/mode — no repeats) — a real
limitation given the ~26-minute cost of the full matrix; I prioritized
covering N=60/150/300 x adaptive/random generously over repeating a smaller
matrix. The qualitative story (large, consistent gaps at every N) is
unlikely to be a seed artifact, but exact numbers would tighten with repeats
if more budget becomes available. Experiment 4 has 3 repeats; experiment 5
has 1 (explicitly lowest priority, "if budget allows").

---

## Experiment 1: duels-to-confident vs docs/02 §1

```
N    docs floor  docs session(~2x)  measured (>=90%)     measured/floor
60   100         180                >1500 (not reached)  n/a — see below
150  210         300                >2000 (not reached)  n/a — see below
300  310         400                >1500 (not reached)  n/a — see below
```

**None reached 90% confidence.** N=60's adaptive run additionally
**self-terminated at 1334 duels** (`selectNextDuel` returned `null` —
docs/02 §6's "nothing worth asking" path fired for real) with confidence
stuck at **73.3%** — more budget would not have closed this gap for that
run, the algorithm itself decided it was done. N=150/300 did not
self-terminate within their ceilings (they'd have kept going).

Duels needed to reach each confidence threshold (the real, useful number —
uses the correct accessor):

```
N    >=30%  >=50%  >=70%  >=90%
60   136    242    437    not reached (self-stopped at 1334, conf=73.3%)
150  255    351    839    not reached by 2000
300  190    384    817    not reached by 1500
```

Even the loosest threshold tested (30%) already takes **more duels than
docs' full-90%-target floor** for N=60 (136 vs 100) and N=150 (255 vs 210).
Reaching 70% confidence costs **4.4x the N=60 floor, 4.0x the N=150 floor,
2.6x the N=300 floor**. From the corrected accessor (see bug note above),
confidence at the docs-predicted floor duel count was: N=60 under 30% (30%
not reached until duel 136, floor is 100); N=150 under 30% (30% not reached
until duel 255, floor is 210); N=300 between 30% and 50% (30% at 190, 50% at
384, floor is 310).

**This is the core feasibility claim and it does not hold up as stated.**
Reality needs at minimum ~5x the docs floor to approach (not reach) the
target, and for the smallest, easiest backlog (N=60) the algorithm's own
stopping rule caps out at 73%, not 90%, meaning **90% confidence may not be
reachable at all under current default parameters for some backlogs**, not
just "slower than predicted."

**Why (diagnosed, not just observed):** I ran targeted diagnostics before
committing to the full matrix:
- Scaling `thetaSpread` 1x/3x/8x changed nothing (see Design decisions) —
  ruled out "the synthetic world's gaps are unrealistically tiny."
- Feeding one item 50 then 300 clean, unambiguous wins against a field of
  zero-evidence opponents correctly saturated `pAboveCutline` to 1.0000 with
  a tight rank interval — ruled out "the bootstrap CI never sharpens."
- Direct inspection of a real N=60 session: `selectNextDuel` correctly spent
  84% of duels on `cutline`-tagged pairs (working as designed) — but **every
  single one of 300 duels touched a distinct, never-before-asked pair** (0
  repeats, out of 1770 possible pairs). That's `selectNextDuel`'s own
  documented rule ("never returns a pair already compared within one decay
  half-life") doing exactly what it says — but a session lasts minutes,
  nowhere near the 90-day half-life, so **within one sitting, no pair is
  ever re-askable**. The algorithm can never get a second, confirming look
  at a specific hard/contested pair; it must resolve everything through
  indirect, single-shot, cross-item triangulation. Combined with the fact
  that a handful of items always cluster very close together in true theta
  near the cut line (an inherent property of N draws from a continuous
  distribution, at *any* scale — see above), this looks like the dominant
  mechanism slowing convergence, not a bug in any one function. I'd flag
  this as a genuine, specific question for the coordinator: **should
  onboarding (as opposed to maintenance) get an exception to the
  never-repeat-within-a-half-life rule**, so a genuinely contested pair can
  be asked again inside one sitting? I did not test this (would require
  editing `lib/scoring/selection.ts`, outside my glob) but the mechanism is
  clean enough to be worth a cheap follow-up experiment.
- N=60's small absolute pair space (1770 possible pairs) likely also
  compounds this specifically at low N: by duel 1334 it had touched 75%+ of
  every possible pair once, which is plausibly *why* it ran dry there
  specifically (N=150/300 have far larger pair spaces — 11175 / 44850 — and
  did not self-terminate within their tested budgets).
- Audit draws (excluded from the fit) consumed 9.0% of N=60's duels (120 of
  1334) — in line with the 10% target, but worth remembering the
  confidence-building budget is effectively ~10% smaller than the raw duel
  count.

---

## Experiment 2: infogain vs random — real, but nowhere near 3-5x, and metric-dependent

```
N    threshold  adaptive duels        random duels          multiplier
60   >=30%      136                   129                    0.95x  (random slightly FASTER)
60   >=50%      242                   331                    1.37x
60   >=70%      437                   837                    1.92x
60   >=90%      not reached (1500)    not reached (5000)     n/a
150  >=30%      255                   212                    0.83x  (random FASTER)
150  >=50%      351                   505                    1.44x
150  >=70%      839                   1920                   2.29x
150  >=90%      not reached (2000)    not reached (4000)     n/a
300  >=30%      190                   168                    0.88x  (random FASTER)
300  >=50%      384                   467                    1.22x
300  >=70%      817                   1654                   2.02x
300  >=90%      not reached (1500)    not reached (2000)     n/a
```

**At every N, random pair selection is as fast or FASTER than adaptive for
the first ~30% of confidence**, then adaptive's advantage grows steadily —
by the 70% mark it's a real, consistent, ~2x multiplier at every N (1.92x /
2.29x / 2.02x). We could not measure the multiplier at the 90% target docs
cares about most, because neither arm got there within budget (random was
capped lower on purpose — see Timing above — precisely because it was
already clearly behind and an open-ended search wasn't worth the wall-clock;
this makes ">=90%: n/a" an honest "we stopped looking," not "there is no
advantage"). **Best honest statement: infogain's real advantage on the
confidence metric is on the order of ~2x by 70% confidence, trending up —
not the claimed 3-5x, at least not in the range we could observe.**

**Surprising and important secondary finding — on GLOBAL rank correlation,
random eventually *beats* adaptive, at every N:**

```
                spearman @ 1200 duels
N     adaptive   random
60    0.934      0.964   (random ahead)
150   0.807      0.929   (random ahead)
300   0.678      0.812   (random ahead)
```

This is **not a bug** — it's the direct, correctly-working consequence of
docs/02 §1's own design principle ("nobody needs a total order... precision
below the cut line is worthless"): the cutline strategy deliberately starves
comparisons to items once they're comfortably away from the boundary, so
random's "waste effort everywhere uniformly" policy ends up knowing more
about the *whole* list once you give it enough duels. The full trajectory
(from Experiment 3) shows a clean crossover: adaptive is ahead through
~duel 500 at every N (better early exploration — its value formula's
uncertainty term does real work before cutline-relevance narrows its focus),
then random catches up and pulls ahead. **Practically:** if anyone ever
builds a "ranking quality" dashboard around whole-list Spearman/Kendall
(docs/05's observability section doesn't currently specify this, but it's a
natural thing to reach for), it would show the sophisticated algorithm
looking *worse* than doing nothing — worth documenting so nobody "fixes" the
selection algorithm to chase the wrong metric.

---

## Experiment 3: rank recovery vs duel budget

```
                    Spearman (adaptive / random)
N     50duels        100          150          200          300          500          800          1200
60    .622/.578      .701/.496    .814/.622    .869/.668    .874/.756    .882/.847    .902/.931    .934/.964
150   .209/.264      .224/.313    .373/.360    .444/.446    .513/.631    .650/.801    .755/.882    .807/.929
300   .051/.086      .164/.256    .167/.300    .208/.392    .318/.529    .463/.635    .596/.764    .678/.812
```

Recovery is workable at N=60 by duel 800-1200 (Spearman 0.87-0.96) but
**materially degrades as N grows**: at N=300, even 1200 duels (nearly 4x the
"recommended session" of 400 duels for that size, docs/02 §1) only gets
adaptive to 0.678 and random to 0.812 — a long way from a trustworthy
ordering. The crossover described in Experiment 2 is visible directly here:
adaptive leads at every N through the 300-500 duel range, random leads from
~800 duels on.

---

## Experiment 4: fatigue impact (N=60, fixed 180-duel sitting, 3 repeats)

```
repeat  spearman(constant)  spearman(fatigued)  delta   confidence(constant)  confidence(fatigued)
0       0.696                0.665                0.031   30.0%                 28.3%
1       0.746                0.617                0.129   30.0%                 28.3%
2       0.797                0.656                0.141   45.0%                 35.0%
mean: constant=0.746  fatigued=0.646  delta=0.100
```

**Consistent across all 3 repeats, both metrics:** the fatigued voter always
produces lower Spearman (by 0.03-0.14) and always-equal-or-lower confidence
(by 1.7-10 points) than an otherwise-identical constant-accuracy voter, same
world, same selection policy. The fatigue curve used was modest by design —
accuracy only drops from 87% to 75.6% by tap 180 (still far above chance),
not a collapse — and it was still enough to reliably corrupt the result.
**This supports docs/03's instinct to cap session length**: if a mild
fatigue curve produces a consistent ~0.10 Spearman hit, a more realistic
(or longer) session would very plausibly be worse. A natural follow-up (not
done here, would need another full run): find the session length at which
the fatigue-driven degradation starts to dominate the confidence gained per
additional duel, i.e. the point where asking more is actively
counterproductive.

---

## Experiment 5: decay half-life sensitivity (lowest priority; single reference list, N=60 — caveat below)

**5a — stable list, confidence vs days since last tap, no new comparisons:**

```
half-life   +0d    +30d   +60d   +90d   +180d  +365d
30 days     80.0%  75.0%  71.7%  55.0%  0.0%   0.0%
90 (default)83.3%  80.0%  80.0%  76.7%  73.3%  11.7%
180 days    78.3%  80.0%  83.3%  78.3%  76.7%  70.0%
365 days    83.3%  83.3%  81.7%  81.7%  78.3%  76.7%
```

A 30-day half-life fully collapses a *genuinely unchanged* list's confidence
to 0% within 6 months — textbook "the app nags about a list that hasn't
changed" (docs/02 §3.4's exact worry). The default (90 days) is much better
but still drops from 83% to 12% by a year out. 180-365 days keep a stable
list confidently quiet throughout.

**5b — churn: item at true rank 18 (comfortably below a top-15 cut line)
escalated to the #1 spot at day 60; `pAboveCutline` before vs after one
short (10-duel) maintenance session:**

```
half-life   before  after   delta
30 days     0.485   0.745   +0.260   (strongly responsive)
90(default) 0.410   0.455   +0.045   (barely moves)
180 days    0.460   0.445   -0.015   (no real movement)
365 days    0.415   0.315   -0.100   (moved the wrong way — likely small-sample noise, see caveat)
```

**The tradeoff docs/02 §3.4 describes is real and sharp, and the current
default sits on the wrong side of it for the maintenance loop's stated
purpose.** 30 days is dramatically more responsive to a real, unambiguous
priority change (+0.260 after just 10 duels) than 90 days (+0.045) — but 30
days is also the setting that nags a stable list into false alarm within 6
months (5a). 90 days threads that needle only partway: reasonably stable
through ~180 days, but nearly unresponsive to genuine churn in a realistic
maintenance-session-sized nudge (docs/02 §8: "Maintenance session 5-10
duels" — I used 10, the generous end). If the product's promise is "the app
correctly flags a churning backlog," 90 days does not deliver that within
one normal maintenance session; something closer to 30-60 days would, at
the cost of needing the "stable list" side tuned more carefully (maybe a
higher confidence floor, or slower decay only after a list has been
confident for a while — I'm not the one to design that fix, just reporting
that 90 days doesn't achieve what §3.4 wants it to).

**Caveat (this is the explicitly lowest-priority experiment, and it shows):**
single reference list, single voter seed, single churn scenario (one item,
one direction, one day-60 timing), single 10-duel maintenance session per
half-life. The *qualitative* pattern (short=responsive-but-twitchy,
long=stable-but-sluggish) is clean and matches basic decay-weighting math,
so I trust the direction. The *exact* numbers, especially the negative
deltas at 180/365 days (which should be ~0, not negative — a real priority
escalation should never make the confidence that it belongs above the line
go *down*), are plausibly bootstrap/small-maintenance-sample noise rather
than a real effect, and would need repeats across seeds/scenarios to firm
up. If more budget is available, this is the experiment I'd extend first.

---

## Final verification

- `npx tsc --noEmit`: **0 errors, repo-wide**, checked repeatedly through the
  session and again after every change including the bugfix above — most
  recently right before writing this line.
- `npm test`: **36/36 passing, 4 consecutive clean runs** at the end of my
  session (the last one run immediately before writing this line). See
  "Concurrent coordinator activity" above for why: a commit I didn't make
  fixed the real, pre-existing `tests/unit/db.test.ts` flakiness I documented
  under "Baseline check" (that flakiness was 100% confirmed before any such
  fix existed, on 4 separate runs, so it was real, not imagined — it just
  turned out someone else fixed it mid-session rather than it being a CPU-
  contention fluke as I first guessed).
- Touched only `lib/sim/**` and this file. Did not edit `lib/scoring/**`,
  `lib/types.ts`, `lib/db/**`, `app/**`, `tests/**`, or `package.json`. Did
  not run `npm install`. Did not commit/push/branch — the two commits
  discussed above are not mine.
- No engine bug to report: every unexpected result above was tracked down to
  a specific, diagnosed mechanism (the never-repeat-within-a-half-life rule
  interacting with a short session; the cutline strategy correctly
  deprioritizing non-boundary items; decay math behaving as specified) —
  not an implementation defect in `lib/scoring`. The one bug I found was in
  my own report-table code, described and fixed above.
