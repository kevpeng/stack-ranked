# 09 — Simulation Findings

> Measured with `lib/sim` against a synthetic voter at 87% accuracy — the
> figure `docs/02 §1` assumes. The harness did what `docs/05` predicted:
> it invalidated a headline claim before it reached a user.
>
> **Numbers here are from the complete run** (full tables and methodology in
> `coord/status/sim.md`). An earlier revision of this document reported
> figures from a partial run and drew the wrong conclusion about adaptive
> selection; Finding 3 below is the corrected version.

## Finding 1 — the convergence budget in `docs/02 §1` is far too optimistic

| | docs/02 §1 predicted | measured |
|---|---|---|
| N=60, duels to 0.9 confidence | ~100 | **not reached.** Selection self-terminated at 1,334 duels, confidence stuck at 0.733 |
| N=150, duels to 0.9 confidence | ~210 | **not reached in 2,000** (0.840) |
| N=300, duels to 0.9 confidence | ~310 | **not reached** within 5–15× the predicted floor |

The information-theoretic floor in `docs/02 §1` is not wrong as arithmetic —
it correctly computes the bits needed to *identify which items are above the
cut line*. It is wrong as a product estimate, because the **confidence metric
asks for something much stronger than identifying the set.**

## Finding 2 — the confidence metric is unachievable by construction

This is the root cause, and it matters more than the budget number.

`docs/02 §6` defines:

```
confidence = fraction of items with P(above cut line) > 0.95 or < 0.05
```

When `selectNextDuel` gave up at duel 1,365 (N=60, capacity 15):

```
confidence = 0.783   (target 0.9)
items still undecided about the cut line: 12 / 60
items with rank CI wider than 4 positions: 59 / 60

sample undecided:
  #12 (p=0.77, CI 8-19)   #13 (p=0.53, CI 10-23)
  #14 (p=0.61, CI 10-21)  #15 (p=0.46, CI 10-23)
  #16 (p=0.55, CI 10-20)
```

Every unresolved item sits at ranks **#9–#16 — precisely at the cut line of
15.** That is not a failure of elicitation. It is the correct answer to an
impossible question.

In the synthetic world, items are evenly spaced in true strength, so items
#12–#16 differ by roughly **0.05 in theta**. At 87% voter accuracy, a gap
that small is close to a coin flip on every single comparison. No quantity of
additional duels will push `P(above cut line)` past 0.95, because the
uncertainty is **irreducible, not statistical** — those items genuinely are
near-equivalent in value.

**The metric conflates two different states:**

| State | What it means | What we should do |
|---|---|---|
| "We haven't measured enough" | More duels will sharpen this | Keep asking |
| "These items are genuinely tied" | More duels change nothing | **Stop and say so** |

Today both read as "not confident", so a real list would plateau in the 70–85%
range forever and the UI would nag about pairs that can never resolve. That is
exactly the fatigue failure `docs/03` warns about, manufactured by our own
metric.

## Finding 3 — adaptive DOES beat random, but ~2×, not the claimed 3–5×

`docs/02 §2.2` claims information-gain selection buys 3–5× over random pairs.
At equal confidence thresholds:

| N | threshold | adaptive | random | multiplier |
|---|---|---|---|---|
| 60 | ≥50% | 242 | 331 | 1.37× |
| 60 | ≥70% | 437 | 837 | **1.92×** |
| 150 | ≥70% | 839 | 1,920 | **2.29×** |
| 300 | ≥70% | 817 | 1,654 | **2.02×** |

The advantage is real, starts near 1× in the first ~30% of confidence, and
grows to roughly **2× by 70%** — trending upward, though neither arm reached
the 90% target so the endpoint is unobserved. So `docs/02 §2.2` is
**directionally right and numerically optimistic**, not wrong.

### The trap: random beats adaptive on whole-list rank correlation

At N=300 / 1,200 duels: adaptive Spearman **0.678**, random **0.812**.

This is **expected and correct behaviour, not a defect.** The cut-line
strategy deliberately starves non-boundary items — precisely what `docs/02 §1`
prescribes with "nobody needs a total order." Adaptive buys cut-line accuracy
by spending nothing on items #200–#300, so a whole-list metric scores it down
for doing its job.

**The trap is for us, later:** anyone who builds a "ranking health" dashboard
on global Spearman will conclude adaptive selection is broken and 'fix' it by
making it worse. Any health metric must be restricted to the cut-line
neighbourhood.

*(An earlier revision of this doc reported "random won" as a headline failure.
That compared unequal budgets on the wrong metric. Corrected above.)*

## Finding 4 — fatigue measurably corrupts results

Consistent across all repeats: a fatigued voter costs **~0.10 Spearman** and
lowers confidence, from a curve that only drops accuracy from 87% to 75.6% by
tap 180. Modest fatigue does real damage.

This supports capping session length — `docs/03`'s "good stopping point"
nudge is not just a courtesy, it protects the data.

## Finding 5 — the default decay half-life leans the wrong way

A sharp tradeoff, single-seed so treat the exact numbers as indicative:

| half-life | responsiveness to a real escalation | a genuinely stable list |
|---|---|---|
| 30 days | **+0.26** pAboveCutline after a 10-duel session | nagged to 0% confidence within 6 months |
| 90 days (default) | +0.045 — nearly unresponsive | stays reasonably quiet |

The default keeps a stable list quiet at the cost of barely reacting to real
churn — which is the wrong failure mode for a tool whose maintenance loop
exists to catch change. Worth a per-list setting or a confidence floor rather
than one global constant.

## What should change

0. **Let onboarding re-ask a contested pair.** The cheapest, highest-value
   fix. In `lib/scoring/selection.ts` a just-asked pair scores ~0 twice over:
   `staleness = 1 - decayWeight(...)` collapses its value, and the `notRecent`
   filter excludes it outright. With a 90-day half-life and a session lasting
   minutes, **every** prior comparison is "recent", so the contested cut-line
   pairs that most need a confirming second look can never get one. A session
   lasting minutes should not be governed by a half-life measured in months.

1. **Redefine "settled" against decision stability, not posterior extremity.**
   A pair is done when more comparisons would not change *the decision* — i.e.
   expected information gain falls below a threshold — not when `p` crosses
   0.95. This fixes Findings 1 and 2 together and makes the progress bar
   reach 100% on a real list.
2. **Surface genuine ties as a result, not a gap.** "These four items are
   effectively equivalent; pick by cost or sequencing" is a *useful product
   output* and arguably a better one than a forced total order. It is also
   honest, which `docs/00`'s positioning demands.
3. **Rerun adaptive vs random at equal budget** before drawing any conclusion
   about selection strategy.
4. **Re-derive the duel budget** from the corrected metric. The `~180 duels
   in one sitting` claim in `docs/00`/`README` is unsupported until then and
   should not be repeated as fact.

## What this does not change

The engine itself is sound. Rank recovery reaches **Spearman 0.93–0.99**
against ground truth, so the Bradley-Terry fit, the prior, the decay and the
bootstrap are all doing their jobs. The ranking is good. What is broken is the
**stopping rule and the progress metric layered on top of it** — which is a
far better problem to have, and a much cheaper one to fix.

## Reproducing

```
npm run sim          # full experiment suite (~20-25 min)
```

The premature-stop diagnostic is reproducible by running the adaptive loop
until `selectNextDuel` returns null and inspecting `pAboveCutline` and the
bootstrap rank intervals of the items around the cut line.
