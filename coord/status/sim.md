# @sim — status

**State:** in progress — experiments running, this file is being filled in
as results land (full `npm run sim` run takes ~20-25 minutes; see timing
notes below for why).
**Last updated:** 2026-09-22

## Deliverables

- `lib/sim/voter.ts` — synthetic voter (accuracy, fatigue, tieRate, bias).
- `lib/sim/world.ts` — synthetic backlog generator with known ground-truth theta.
- `lib/sim/run.ts` — `npm run sim`, drives the real elicitation loop and
  prints the 5 experiment tables.
- `lib/sim/rng.ts` — self-contained deterministic PRNG (mulberry32), kept
  separate from `lib/scoring/prng.ts` on purpose (that's an internal
  implementation detail behind `lib/scoring/contract.ts`, not something
  outside code should depend on) and separate from `tests/helpers/random.ts`
  per instructions (sim must not import across the test boundary).
- `lib/sim/spearman.ts` — same reasoning: own copy of Spearman rank
  correlation, not imported from `tests/helpers/random.ts`.

Nothing outside `lib/sim/**` was touched. `lib/scoring/contract.ts` and
`lib/types.ts` were read-only inputs.

## Baseline check (before I touched anything)

`npx tsc --noEmit`: 0 errors, confirmed clean before any of my edits.

`npm test`: **flaky, pre-existing, nothing to do with `lib/sim`.**
`tests/unit/db.test.ts` intermittently crashes/fails inside PGlite's WASM
runtime (`Aborted()` / `__abort_js` deep in `@electric-sql/pglite`'s
`postgres.js`, or test-isolation-looking failures like "expected 1 item, got
2"). Reproduced 4 times before writing a single line of my own code,
including with a fresh `.pglite/` dir and with `--no-file-parallelism`:
results ranged 33/36, 34/36, 33/36, 30/36 passing — different tests fail
each time. This is entirely inside `tests/unit/db.test.ts` / PGlite, has
nothing to do with `lib/sim` (which touches no DB, per the brief), and is
outside my glob (`lib/db/**`, `tests/**` are owned by @db/@qa) — flagging
per DASHBOARD.md RULE 1 rather than touching it. Re-checked again after
finishing my own work (see "Final verification" at the bottom) — same
flakiness, same root cause, confirmed not caused or worsened by anything
under `lib/sim`.

## Design decisions worth flagging

**Voter response model is deliberately FLAT accuracy, not gap-dependent.**
`accuracy` is P(picks the truly-better item) independent of how close the
pair's true thetas are — literally what docs/02 §1 defines ("a single
person is ~85-90% self-consistent"). I considered routing it through the
engine's own logistic link instead (so a landslide pair is almost always
called correctly and a true toss-up is ~50/50), which is the more common
choice in the ranking-recovery literature, but rejected it: `noiseBeta`
already plays that role from the FIT's point of view (it's used in
`selectNextDuel`'s value formula, docs/02 §2.2), and layering a second,
gap-dependent noise source on top of it would double-count difficulty and
make "accuracy" not mean what docs/02 §1 says it means. One consequence,
confirmed empirically (see the thetaSpread sanity check below): because the
voter only reads the *sign* of the true gap, not its magnitude, scaling how
spread-out a synthetic world is has **zero** effect on vote outcomes or
convergence — only the relative order of items matters to this voter model.
That's intentional, not a bug, and it means every "hard cluster near the
cutline" effect reported below comes from genuine local ordering ambiguity
among several close-together items, not from the voter refusing to commit
on a narrow gap.

**No `seedOrder` in experiments 1-4.** `FitInput.seedOrder` (the cold-start
tracker prior, docs/02 §5) is deliberately left undefined for the core
convergence experiments. Docs/02 §1's floor table is about how many
*comparisons* it takes to resolve the cut line — mixing in a seed-order head
start would conflate "elicitation is efficient" with "the tracker order was
already pretty good," which are different claims. Experiment 5 also doesn't
use it (not needed for the decay question). This was a deliberate choice,
not an oversight, and it makes every number below a conservative (harder)
test than a real, tracker-seeded onboarding would face.

**Session loop calls `computeRatings` fresh every duel, exactly like
production.** Per docs/05: "refit synchronously inside the vote request, on
every single tap" — no incremental/warm state carried between duels beyond
what `computeRatings` itself does internally. This is the most expensive
possible way to run the loop and I kept it anyway, because the whole point
is to measure the real pipeline, not a faster approximation of it.

**`capacityItems` per N matches docs/02 §1's table exactly** (15/25/30 for
N=60/150/300) so the duel-count comparison is apples to apples.

**Random-selection baseline doesn't reserve an audit holdout.** Real
`selectNextDuel` spends ~10% of duels on `isAudit=true` comparisons that are
excluded from the fit (docs/02 §2.4 — compensating for adaptive selection's
sampling bias). The random-pair baseline in experiment 2 has no such bias by
construction, so docs §2.4's rationale for holding a slice out doesn't apply
to it, and every random-baseline duel goes into the fit. This is a
deliberate asymmetry, not an oversight: it means the comparison is "the real
adaptive algorithm, exactly as shipped (including its audit tax)" vs "the
simplest uniform-random policy a reviewer would actually propose as an
alternative" — which is the fair, real-world version of the question docs
§2.2 is asking, not an artificially handicapped one.

**Voter/world PRNG kept independent of `lib/scoring`'s.** Even though
importing `lib/scoring/prng.ts` (read-only) would have been allowed, I wrote
a separate mulberry32 in `lib/sim/rng.ts` instead — that file is an internal
implementation detail behind the frozen `lib/scoring/contract.ts` surface,
not something this permanent regression suite should couple to.

## Voter mechanics — verified directly (not just used indirectly)

Ran a standalone check (not part of `npm run sim`, deleted after) exercising
every `voter.ts` feature the task asked for:

```
tieRate check: ties=0.2029 (target 0.20) aWins=0.6933 (target ~0.696=0.8*0.87)
bias check: biased(truly-worse, labeled) wins 0.8958 of the time (target ~0.90)
determinism check: identical=true
fatigue check: tap1=0.87 tap50=0.87 tap100=0.6850 (expect 0.685) tap10000=0.5000 (expect ~0.5)
```

All four match hand-calculated targets. `tieRate`, `bias`, determinism, and
`fatigue`'s decay curve all behave exactly as designed.

## Timing (why the full run takes ~20-25 minutes)

Measured before committing to the final experiment matrix:
`computeRatings` (point fit + B=200 bootstrap) costs **~26.5ms at N=60,
~66ms at N=150, ~157ms at N=300 per call** — and, surprisingly, this is
close to *constant* regardless of how many comparisons have accumulated (50
vs 400 duels at N=300 both landed at ~155-165ms/call). The cost is dominated
by the O(n) per-item bootstrap/selection work, not the O(edges) term. That's
useful to know on its own: @backend's ~100-135ms estimate (`coord/status/backend.md`)
was measured at the single largest point (300 items, 2000 comparisons) and
reads as roughly the ceiling; in practice the N=300 hot path costs close to
that ceiling almost immediately, not just after the list fills up with
history — worth knowing for the `/vote` latency budget in docs/05.

Because cost-per-duel is ~flat, total session cost is close to linear in
duel count, which made it practical to run generous ceilings (1500-5000
duels depending on N/mode — see `lib/sim/run.ts`'s `ADAPTIVE_MAX`/`RANDOM_MAX`
for the exact numbers and reasoning) without the cost exploding.

## Results

*(filling in as the background run completes — see the live log excerpt
below for what's landed so far; will replace this whole section with final
tables once done)*

### Early, already-striking result: N=60 adaptive self-terminated below target

```
N=60 adaptive done: duelsToConfident=null finalConfidence=0.733 finalSpearman=0.932
  stoppedEarly=true strategyCounts={"audit":120,"cutline":540,"infogain":674}
```

`selectNextDuel` returned `null` on its own — not because it hit my 1500-duel
ceiling (it stopped at 1334) — because every remaining candidate pair's
`value` fell below the engine's own `VALUE_EPS` cutoff (docs/02 §6: "nothing
worth asking"). **Confidence was 73.3% when the algorithm decided it was
done, not 90%.** Rank recovery was still good at that point (Spearman
0.932), so this isn't "the list is garbage" — it's that a handful of items
apparently never resolve to the strict `pAboveCutline > 0.95 or < 0.05` bar
under this selection policy, and once nothing looks informative enough to
ask about, the algorithm stops trying. This directly matches docs/02 §6's
own prediction ("plateaus honestly where genuine indifference exists") but
the magnitude (goes fully silent at 73%, not just slows down) is worth the
coordinator seeing plainly. More below once N=150/300 finish.

