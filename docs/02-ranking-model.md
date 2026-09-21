# 02 — The Ranking Model

The whole product is downstream of two questions: **which pair do we show next**, and **what do we believe given all the taps so far**. Keep them strictly separate. Conflating them is the classic mistake — Beli's binary search is an *elicitation* strategy, and using it as your *storage* model means one early misclick permanently corrupts a list with no way to recover.

```
  ┌────────────────┐         ┌──────────────────┐        ┌─────────────────┐
  │  ELICITATION   │  duel   │   COMPARISONS    │  fit   │   AGGREGATION   │
  │ which pair?    │ ──────▶ │  append-only log │ ─────▶ │ Bradley–Terry   │
  │ (§2)           │         │  (never mutated) │        │ θ + σ  (§3)     │
  └────────▲───────┘         └──────────────────┘        └────────┬────────┘
           │                                                      │
           └──────────────── posterior guides next pair ──────────┘
```

---

## 1. Why pairwise, with numbers

Ordering N items requires at minimum `log₂(N!)` bits. For a 60-item ladder that's **~272 bits**.

Human comparisons are noisy. At ~80% accuracy per comparison, each one carries `1 − H(0.8) ≈ 0.28` bits. So a *complete total order* of 60 items costs roughly **~980 comparisons**. That sounds fatal.

It isn't, because **nobody needs a total order.** The real question is "which ~15 items are above the cut line this quarter?" — identifying a 15-subset of 60 is `log₂(C(60,15)) ≈ 46 bits`, or **~165 comparisons** at the same noise level. Allowing for imperfect pair selection, call it **300–500 duels**.

At 8 voters × 5 duels/day = 40/day, a 60-item ladder settles its cut line in **8–12 days**, faster once intake duels contribute. That is the core feasibility argument for the product, and it holds only if we spend comparisons where the decision is. Which is §2.

And placing a *single new item*: `log₂(60) ≈ 6` taps, or **~5 taps** if a coarse tier narrows the search space first. That's the Beli intake experience, and it's cheap.

---

## 2. Elicitation — which pair to show

Five strategies, each tagged on the Duel record so we can audit selection bias later.

### 2.1 `insertion` — placing a new item (the Beli move)

Coarse tier (Now / Next / Later) → binary search within that tier against the current consensus order.

```
place(item, tier):
    lo, hi = bounds of tier in consensus order
    while hi - lo > 1 and taps < MAX_TAPS:          # MAX_TAPS = 6
        mid = (lo + hi) / 2
        winner = ask(item vs ladder[mid])
        if winner is item: hi = mid else: lo = mid
    return provisional rank in (lo, hi)
```

Two deviations from textbook binary search, both important:

- **Comparisons are recorded as ordinary comparisons, not as a placement.** The item lands at a provisional rank immediately (good UX), but the authoritative rank comes from the next model fit like everything else. A misclick costs a little accuracy, not a permanent wrong position.
- **Jitter the probe.** Don't always probe the exact midpoint; sample near it. Always probing the midpoint means the median item accumulates comparisons out of all proportion and the tails stay unmeasured.

### 2.2 `infogain` — the daily duel (the default)

Random pairing is the naive version, and it's wasteful: in a 60-item ladder ~72% of random pairs are more than 10 ranks apart, where the outcome is already near-certain. A pair at `p = 0.97` carries `H(0.97) ≈ 0.19` bits; a genuine toss-up carries `1.0`. **Adaptive selection buys ~3–5× the information per tap** — which is the difference between a ladder settling in a week and settling in a month.

Score every candidate pair, sample from the top with some randomness (never deterministic — that creates feedback loops):

```
p_ij     = Φ( (θ_i − θ_j) / sqrt(2β² + σ_i² + σ_j²) )     # β = comparison noise
value(i,j) = H(p_ij)                    # outcome entropy: peaks at a toss-up
           × (σ_i² + σ_j²)              # prefer items we're unsure about
           × relevance(i,j)             # §2.3 — cut-line weighting
           × novelty(i,j,voter)         # this voter hasn't seen this pair
           × comparability(i,j)         # same tier/epic ⇒ answerable
```

`comparability` is the one that keeps the product usable. A mathematically perfect toss-up between a security chore and a marketing experiment is an *unanswerable* question, and asking it burns trust. Penalize cross-category pairs; if the ladder is full of them, the ladder is wrong (§6).

### 2.3 `cutline` — spend where the decision is

**Precision below the cut line is worthless.** Whether an item is #41 or #48 changes nothing. Whether it's #14 or #16, when capacity is 15, changes everything.

```
relevance(i,j) ∝ max over the pair of:  1 − |2·P(item above cut line) − 1|
```

Items confidently in (P>0.95) or confidently out (P<0.05) stop generating duels. Items straddling the line get hammered. This is what makes the settled-percentage climb feel fast, and it's the biggest single lever on time-to-decision.

### 2.4 `challenge` — targeted reprioritization

A challenge on item X schedules duels of X against its posterior neighbors and the items it would displace. Bounded (≤ 8 duels), time-boxed (48h), and resolved explicitly so the challenger gets closure either way.

### 2.5 `audit` — keep ~10–15% of duels uniformly random

Non-negotiable, and easy to forget. Adaptive selection is a *biased sample by construction*, which means:
- Model fit quality can't be honestly evaluated on adaptively-chosen pairs.
- Systematic drift (an item everyone's opinion changed about) is invisible if we stopped asking about it.

Reserve a slice of random pairs as a **held-out audit set**: never used to select future pairs, used to measure predictive accuracy (§7). If the model can't beat chance on random pairs, the ladder is incoherent and we should say so out loud rather than render a confident-looking list.

---

## 3. Aggregation — Bradley–Terry

Each item has a latent strength `θ_i > 0` (or `β_i = log θ_i`):

```
P(i beats j) = θ_i / (θ_i + θ_j) = σ(β_i − β_j)
```

Fit by MAP over all comparisons on the ladder. **Hunter's MM algorithm** — no gradients, no step size, guaranteed monotone convergence, ~30 lines:

```
repeat until Δ < ε:
    for each item i:
        θ_i ←  W_i  /  Σ_{j≠i}  n_ij / (θ_i + θ_j)
    normalize (geometric mean = 1)
```
where `W_i` = weighted wins of i, `n_ij` = weighted comparisons between i and j.

### 3.1 Regularization (the bug everyone hits)

An undefeated item drives `θ → ∞`; a winless item drives `θ → 0`; the MLE doesn't exist and the fit silently diverges. Every new item is in exactly this state on its first duel, so this is not an edge case — it's the common case.

**Fix:** give every item two pseudo-comparisons — one win, one loss — against a phantom item pinned at `θ = 1`. This is a Beta prior on each item, it makes the MAP always finite, and it shrinks thin-evidence items toward the middle, which is exactly the honest behavior. Prior strength is a tunable (`κ ≈ 1–2` pseudo-comparisons); the cold-start prior (§5) rides in here too.

### 3.2 Voter weights

Weight each comparison's contribution by `w_v`:

```
W_i = Σ over wins  w_v · d(t) ;   n_ij = Σ over pair  w_v · d(t)
```

Weights are **visible to everyone** on the ladder. A hidden weighting scheme discovered later is a trust catastrophe; a visible one ("Eng leads weigh 1.5× on effort ladders") is just a policy people can argue with. Default: everyone 1.0. Let the PM adjust with a reason.

### 3.3 Ties

"Too close to call" counts as **half a win to each side**. Simple, correct enough, and it prevents indifferent voters from injecting coin flips. (The principled version is Davidson's tie-extended model with an explicit tie parameter `ν`; worth it only if ties exceed ~20% of responses. Track the rate and revisit.)

### 3.4 Time decay

Opinions change and tickets change under them. Weight each comparison by `d(t) = 0.5^(age / halflife)`, default **half-life 60 days**.

Decay does real work beyond freshness: it means confidence *erodes* without maintenance, so the settled-% bar drifts down, which is a natural, non-nagging reason to keep playing. It also makes seasons work — last quarter's consensus carries forward at reduced confidence rather than being thrown away or trusted blindly.

### 3.5 Online Elo for instant feedback

A full refit on every tap is neither necessary nor fast enough for a Slack response. Elo *is* an online approximation of Bradley–Terry, so use it as the front end:

```
E_i = 1 / (1 + 10^((R_j − R_i)/400))
R_i += K · (S − E_i)        K = 32 for provisional items (< 8 comparisons)
                            K = 12 once settled
```

Elo updates inline (<50ms, shows movement immediately, powers upset alerts); the batch MAP fit runs every N comparisons and nightly and is **authoritative**. When they disagree, the batch fit wins and the UI just moves. Keep both numbers and alert if they diverge badly — that's a bug signal.

---

## 4. Uncertainty

Needed for three things: adaptive selection (§2.2), the settled metric (§6), and honest display.

**Use the bootstrap.** Resample the comparison log with replacement `B = 200` times, refit, collect the rank of each item across fits. It's trivially parallel, it's ~20 lines, it makes no asymptotic assumptions, and — decisively — it yields *rank* intervals directly, which is what we display:

> **#14** · 90% CI: #9–#21 · 23 comparisons

The analytic alternative (invert the Fisher information, `I_ii = Σ_j n_ij p_ij(1−p_ij)`, with one `β` pinned for identifiability) is faster but gives variances on `β`, which then need a delta-method hop to rank. Not worth the complexity at our scale — a 200-item ladder with 10k comparisons refits in milliseconds, so 200 bootstrap fits is still under a second.

**Display rule:** never show a bare rank without its interval where the interval is wide. "#14" implies precision we don't have; "#14 (could be #9–#21)" tells the truth and, usefully, invites people to go resolve it.

---

## 5. Cold start

A brand-new ladder with zero comparisons must not show a random order.

1. **Seed from the tracker.** Existing `priority` field + existing backlog rank order → an initial `β₀` per item. Teams have *already* expressed an ordering by dragging things around; use it.
2. Encode it as prior pseudo-comparisons in §3.1 — weak (`κ ≈ 1`), so ~5 real comparisons overwhelm it.
3. Label the ladder **"Seeded — 0% settled"** and hide the cut line until ~2 comparisons per item exist. Showing a confident-looking list built from priors is the fastest way to lose credibility on day one.

Bonus: the divergence between the seeded order and the settled order is a great artifact. *"Your Jira order and your team's actual beliefs disagree on 22 of 61 items."* That's the aha moment for a design partner, and it's free.

---

## 6. When is it done? — the "settled" metric

Don't define settled as "all pairs resolved" (never happens, and mostly irrelevant). Define it against the decision:

```
settled = fraction of items with P(above cut line) > 0.95 or < 0.05
```

Computed directly from the bootstrap. Properties we want and get: it starts near zero, climbs fast (because cut-line-relevant duels are prioritized), plateaus honestly when genuine disagreement exists, and **decays over time** via §3.4.

Stop-asking rules, so the product doesn't nag forever:
- An item confidently in or out generates no more duels (except audit pairs).
- A pair with `p > 0.9` is not re-asked within a half-life.
- A ladder above 90% settled drops to a weekly maintenance cadence instead of daily.

### Intransitivity is a diagnostic, not a failure

Cycles (A>B, B>C, C>A) will happen. A few are noise. *Many* mean the ladder is mixing things that can't be compared on one axis — the classic case is a ladder containing both customer features and infra work, where people apply different criteria depending on the pair.

Measure it: sample triads with data on all three edges, count cycles, compare to the rate expected from the fitted model's noise. Significantly excess cycles → surface the recommendation:

> ⚠️ This ladder has 3.1× the expected cycle rate. Voters appear to be using different criteria for `infra` vs `growth` items. **Consider splitting this ladder.**

That's a genuinely useful diagnostic that no scoring spreadsheet can produce.

---

## 7. Validation — how we know the model is right

**Before any user exists: a simulation harness.** Generate synthetic items with known ground-truth `θ`, synthetic voters with per-voter bias (e.g. Sales systematically over-weights `enterprise`-labelled items), noise, laziness, and adversarial stuffing. Replay the full pipeline. This lets us answer, offline and cheaply:

- How many duels to settle the cut line at N=30/60/150 and 5/10/20 voters?
- Does infogain selection actually beat random, and by how much? (Expect 3–5×; verify.)
- How badly does one bad-faith voter distort the top 10? At what weight does it matter?
- Does time decay produce oscillation?

This harness is the highest-value thing to build in week one of Phase 1 and it de-risks every tuning decision that follows.

**With real users:**
- **Held-out accuracy** on the §2.5 audit set. Target: >75%. Below ~65% means the ladder isn't measuring a coherent thing.
- **Rank stability** — Kendall's τ between consecutive weekly fits, excluding new items. Should rise toward ~0.9.
- **Outcome correlation** (the real one, and the slowest) — for shipped items, did the high-ranked ones actually move the metrics people claimed? Feeding this back closes the loop and converts calibration scoring (see [03](03-gamification.md)) from a popularity measure into something with teeth.

---

## 8. Personal ladders

Beli's list is personal. Ours is shared. Both should exist — but a personal ladder is a **view**, not a separate object: refit BT using only voter `v`'s comparisons, with a strong shrinkage prior toward the consensus.

Each person has far too few comparisons to support a standalone fit, and shrinkage handles that exactly right: where you've expressed an opinion, your list reflects you; where you haven't, it defers to the group. Free byproducts: *"you and Devon agree 84% of the time"*, *"your list vs. the consensus"*, and the per-role aggregation that powers the disagreement map in [01](01-product-spec.md).

---

## 9. Parameter defaults (tune with the harness in §7)

| Parameter | Default | Notes |
|---|---|---|
| Comparison noise `β` | 0.6 | Fit from audit-set accuracy once data exists |
| Prior strength `κ` | 1.5 pseudo-comparisons | Higher = more shrinkage for new items |
| Decay half-life | 60 days | Shorter for fast-moving ladders |
| Elo `K` | 32 provisional / 12 settled | Provisional = fewer than 8 comparisons |
| Bootstrap `B` | 200 | 400 for ladders > 150 items |
| Audit fraction | 12% | Never below 10% |
| Max duels/session | 5 | Hard cap |
| Max insertion taps | 6 | |
| Settled threshold | P > 0.95 / < 0.05 | |
| Refit trigger | every 25 comparisons, and nightly | |
