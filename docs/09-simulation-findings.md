# 09 — Simulation Findings

> Measured with `lib/sim` and a direct diagnostic probe, against a synthetic
> voter at 87% accuracy — the figure `docs/02 §1` assumes. **Two headline
> claims in `docs/02` do not survive measurement.** This is what the harness
> was built to find, and it found it before any of it reached a user.

## Finding 1 — the convergence budget in `docs/02 §1` is far too optimistic

| | docs/02 §1 predicted | measured |
|---|---|---|
| N=60, duels to 0.9 confidence | ~100 | **not reached in 1,380** (plateaus ~0.78–0.82) |
| N=150, duels to 0.9 confidence | ~210 | **not reached in 2,000** (reached 0.840) |

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

## Finding 3 — adaptive selection did not beat random

`docs/02 §2.2` claims information-gain selection buys 3–5× over random pairs.

| N=60 | final confidence | final Spearman vs truth |
|---|---|---|
| adaptive | 0.733 | 0.932 |
| random | **0.850** | **0.990** |

Random won on both, and notably on **rank recovery** (0.990 vs 0.932) — the
measure of whether the ranking is actually right.

**Caveats, stated honestly:** random was given a larger budget (5,000 duels vs
adaptive's 1,500 cap), so this is not an equal-budget comparison. And adaptive
reported `stoppedEarly=true` — it exhausted what it considered worth asking
and then stopped, while random simply kept going.

So this is **not yet proof that infogain is worthless.** The likelier reading,
given Finding 2: adaptive concentrates duels on the cut-line cluster, which is
exactly where the answer is irreducibly uncertain, so it spends its budget on
unanswerable pairs and starves the rest of the list — which is what drags its
Spearman down. Random spreads attention and recovers the overall order better
while never resolving the cut line either.

If that reading is right, it is an argument for **rebalancing** cut-line focus
rather than abandoning adaptive selection. It needs an equal-budget rerun to
confirm.

## What should change

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
