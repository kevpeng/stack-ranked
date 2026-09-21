# 02 — The Ranking Model

Two questions, kept strictly separate: **which pair do we show next**, and **what do we believe given every tap so far**.

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

## 1. The budget, for one voter

Ordering N items needs at minimum `log₂(N!)` bits. A single person is **~85–90% self-consistent** — meaningfully better than a committee, because there's no inter-person disagreement, only intra-person noise. At 87% accuracy each comparison carries ~0.45 bits.

| Backlog | Full total order | **Cut line only** | At 5s/duel | Recommended session |
|---|---|---|---|---|
| 60 items, top 15 | ~620 comparisons | **~100** | ~9 min | ~180 duels (~15 min) |
| 150 items, top 25 | ~2,000 comparisons | **~210** | ~18 min | ~300 duels (~25 min) |
| 300 items, top 30 | ~4,600 comparisons | **~310** | ~26 min | ~400 duels (~33 min) |

The "cut line" column is the *information-theoretic floor* — what perfect pair selection would cost. Real selection isn't perfect, so budget roughly **2× the floor**, which is where the recommended session lengths come from. For backlogs past ~150 items the full session stops being one sitting; offer a **"top 30 only"** mode that ranks the part that matters and leaves the tail seeded.

Two things fall out of this table, and they define the product:

**Nobody needs a total order.** Identifying *which 15 of 60 are above the line* is a 46-bit question; fully ordering 60 items is a 272-bit question. Precision below the cut line is worthless — whether something is #41 or #48 changes nothing. Spending comparisons there is the single biggest waste available to us (§2.3).

**Convergence is a sitting, not a wait.** ~100–200 duels is 8–17 minutes. The multiplayer version of this product has to wait two weeks for ten people to vote; this one finishes before Priya's coffee gets cold. Every design decision should protect that.

Placing a *single* new item afterward: `log₂(60) ≈ 6` taps, or **~4 taps** with a coarse tier first.

---

## 2. Elicitation — which pair to show

Four strategies. Each is tagged on the Duel record, so we can audit what we asked and why.

### 2.1 `placement` — a new or unplaced item

Coarse tier (Now / Next / Later / Never) → binary search within the tier.

```
place(item, tier):
    lo, hi = bounds of tier in current order
    while hi - lo > 1 and taps < MAX_TAPS:        # MAX_TAPS = 6
        mid = jittered_midpoint(lo, hi)
        winner = ask(item vs list[mid])
        if winner is item: hi = mid else: lo = mid
    return provisional rank in (lo, hi)
```

Two deviations from textbook binary search:

- **Comparisons are recorded as ordinary comparisons, not as a placement.** The item lands immediately (good UX) but its authoritative rank comes from the next fit like everything else. A misclick costs a little accuracy, not a permanent wrong position. This is the single most important reason not to store the list as a literal array (§3.0).
- **Jitter the probe.** Always probing the exact midpoint means the median item accumulates comparisons out of all proportion while the tails stay unmeasured.

### 2.2 `infogain` — maintenance duels

Random pairing is wasteful: in a 60-item list ~72% of random pairs are more than 10 ranks apart, where the answer is already near-certain. A pair at `p = 0.97` carries `H(0.97) ≈ 0.19` bits; a real toss-up carries `1.0`. **Adaptive selection buys ~3–5× the information per tap.**

```
p_ij      = Φ( (θ_i − θ_j) / sqrt(2β² + σ_i² + σ_j²) )
value(i,j) = H(p_ij)               # outcome entropy — peaks at a toss-up
           × (σ_i² + σ_j²)         # prefer items we're unsure about
           × relevance(i,j)        # §2.3 — cut-line weighting
           × staleness(i,j)        # confidence has decayed here
           × comparability(i,j)    # same tier/epic ⇒ actually answerable
```

Sample from the top scorers with randomness; never pick deterministically, or the selection policy and the model form a feedback loop.

`comparability` is what keeps it usable. A mathematically perfect toss-up between a security chore and a marketing experiment is an *unanswerable* question, and asking it burns trust in the whole exercise. Penalize cross-category pairs — and if a list is full of them, the list is scoped wrong (§6).

### 2.3 `cutline` — spend where the decision is

```
relevance(i,j) ∝ max over the pair of:  1 − |2·P(item above cut line) − 1|
```

Items confidently in (P > 0.95) or out (P < 0.05) stop generating duels. Items straddling the line get hammered. This is the difference between the ~100-comparison budget in §1 and the ~700-comparison one.

### 2.4 `audit` — ~10% uniformly random

Adaptive selection is a biased sample by construction, so model quality can't be honestly measured on adaptively-chosen pairs. Hold out a slice of uniformly random comparisons, **excluded from the fit**, used only to measure predictive accuracy (§7).

Single-player reframes what this measures: not "is the group coherent" but **"how self-consistent am I?"** — which is a genuinely interesting number to show Priya, and the honest basis for the confidence figures everywhere else in the UI.

---

## 3. Aggregation — Bradley–Terry

### 3.0 Does BT still earn its place with one voter?

Worth asking seriously. Beli itself doesn't do this — it maintains a literal ordered list and inserts into it. That's simpler, deterministic, instantly explainable ("you put it there"), and with one voter there's no consensus to compute. A real argument.

**Three things break if the list is just an array, and all three are core to this product:**

1. **Self-inconsistency has nowhere to live.** You'll say A > B today and B > A in six weeks. An array takes whichever came last and silently encodes a contradiction. A model treats both as evidence, lands between them, and can *tell you the pair is unresolved* — which is exactly when it should ask again.
2. **There's no confidence, so staleness is invisible.** An array can't distinguish a position set deliberately last week from one set carelessly in March. Decaying confidence (§3.4) is what powers the maintenance loop, the "84% confident" number, and the entire reason to open the app on day 40. Without it this is a one-shot utility.
3. **The list changes underneath old placements.** Place X at #14 in March; by June, 20 items above it are shipped or deleted. An array keeps X at #14 for no reason. A model knows its evidence has aged and re-asks.

There's also a cheap bonus: **rank intervals**. "#14, somewhere between #9 and #21" is honest in a way an array position never is, and it tells Priya where her own list is soft.

So: keep BT, delete everything the committee needed. **Gone with multiplayer:** vote weights, per-role fits, consensus reconciliation, voter reliability estimation. **Also gone:** the online/batch split — see §3.5.

### 3.1 The model

```
P(i beats j) = θ_i / (θ_i + θ_j) = σ(β_i − β_j)
```

Fit by MAP with **Hunter's MM algorithm** — no gradients, no step size, guaranteed monotone convergence, ~30 lines:

```
repeat until Δ < ε:
    for each item i:
        θ_i ←  W_i  /  Σ_{j≠i}  n_ij / (θ_i + θ_j)
    normalize (geometric mean = 1)
```
`W_i` = decayed wins of i; `n_ij` = decayed comparison count between i and j.

### 3.2 Regularization (the bug everyone hits)

An undefeated item drives `θ → ∞`, a winless one drives `θ → 0`, and the MLE doesn't exist. **Every newly placed item is in exactly this state**, so this is the common case, not an edge case.

**Fix:** give every item two pseudo-comparisons — one win, one loss — against a phantom item pinned at `θ = 1`. That's a Beta prior per item; it keeps the MAP finite and shrinks thin-evidence items toward the middle, which is the honest behavior. Prior strength `κ ≈ 1.5`; the cold-start seed (§5) rides in here too.

### 3.3 Ties

"Too close to call" counts as **half a win each**. Simple and sufficient. (Davidson's tie-parameter model is the principled version — worth it only if ties exceed ~20% of responses. Track the rate.)

### 3.4 Decay — the load-bearing parameter

Weight each comparison by `d(t) = 0.5^(age / halflife)`, default **half-life 90 days** (longer than the multiplayer default: one person's preferences are more stable than a group's, and there's no turnover).

Decay does the real work in a single-player product:
- Confidence **erodes without maintenance**, so the list surfaces its own stale regions.
- It gives the app a reason to exist on day 40.
- It resolves §3.0's contradiction case correctly — recent taps outweigh old ones without discarding history.

**Tune this carefully.** Too fast and the app nags about a list that hasn't changed; too slow and it confidently reports a stale order. This is the parameter most worth measuring in the harness (§7) and most worth exposing in settings.

### 3.5 No Elo, no batch jobs

The multiplayer design needed online Elo for instant feedback plus a nightly batch fit for correctness. **Single-player deletes that entire split.**

One voter's list is small: 300 items and 2,000 comparisons converge in **well under a millisecond**. So refit synchronously, inside the vote request, on every single tap.

That removes: the Elo implementation, the dual-system divergence bug class, the refit queue, the job scheduler for scoring, and every "why does the UI disagree with the API" question. It also means the rank Priya sees after a tap *is* the authoritative rank — no reconciliation, ever. Significant simplification, purely a gift of the smaller scope.

---

## 4. Uncertainty

**Bootstrap.** Resample the comparison log with replacement `B = 200` times, refit, collect each item's rank distribution. ~20 lines, embarrassingly parallel, no asymptotic assumptions, and it yields *rank* intervals directly — which is what we display:

> **#14** · 90% CI: #9–#21 · 23 comparisons

At single-player scale, 200 bootstrap fits still land in ~100ms, so this stays inside the request alongside §3.5.

**Display rule:** never show a bare rank where the interval is wide. "#14" claims precision we don't have; "#14 (could be #9–#21)" is true and doubles as an invitation to go resolve it.

---

## 5. Cold start — and the first-session payoff

A new list must never show a random order.

1. **Seed from the tracker.** Existing backlog rank + priority field → an initial `β₀`. Priya has already expressed an ordering by dragging; use it.
2. Encode as weak prior pseudo-comparisons (§3.2, `κ ≈ 1`) so ~5 real comparisons overwhelm it.
3. Show **"Seeded — 0% confident"** and hide the cut line until ~2 comparisons per item exist. A confident-looking list built from priors is the fastest way to lose trust on day one.

**Then keep the seed forever**, because the divergence between it and the settled order is the product's best moment:

> Your stored order and your judgment disagree on **34 of 61** items.
> 9 items you had below the cut line belong above it.

In the multiplayer design this was a footnote. Here it's the headline — the single clearest evidence that fifteen minutes of tapping bought something real.

---

## 6. Confidence, and when to stop asking

Don't define "done" as "all pairs resolved." Define it against the decision:

```
confidence = fraction of items with P(above cut line) > 0.95 or < 0.05
```

Straight from the bootstrap. It starts near zero, climbs fast (because §2.3 prioritizes the boundary), plateaus honestly where genuine indifference exists, and **decays over time** via §3.4.

Stop-asking rules, so the app never nags:
- Items confidently in or out generate no duels (except audit pairs).
- A pair at `p > 0.9` isn't re-asked within one half-life.
- Above 90% confident, drop to a weekly cadence.

### Intransitivity is a diagnostic

Cycles (A>B, B>C, C>A) happen even within one head. A few are noise. Many mean the list mixes things that can't be compared on one axis — usually customer features against infra work, where you're unconsciously switching criteria per pair.

Measure it: sample triads with all three edges present, count cycles, compare to the rate the fitted model predicts. Excess cycles →

> ⚠️ This list has 3.1× the expected cycle rate — you seem to be applying different criteria to `infra` vs `growth` items. **Consider splitting it into two lists.**

A genuinely useful diagnostic, and one no spreadsheet can produce. It's also the honest response to a real risk: that "which ships first" is not actually one question.

---

## 7. Validation

**Before any user exists: a simulation harness.** Synthetic items with known ground-truth θ, a synthetic voter with configurable noise, drift, fatigue (accuracy decaying through a long session) and occasional contradiction. Replay the pipeline. It answers, offline and free:

- duels-to-confident at N = 60 / 150 / 300 — does the §1 table survive realistic noise?
- infogain vs. random — the real multiplier, not the estimated one
- **what decay half-life keeps a stable backlog quiet while flagging a churning one** (the §3.4 question, and the hardest to guess)
- does fatigue late in a ~180-duel session measurably corrupt the result? If so, cap the session.

This is the highest-leverage week of engineering in the project: pure TypeScript, no dependencies, no integrations, and it turns every guess in §9 into a measurement. It's also the permanent regression suite for the scoring engine.

**With a real user:**
- **Audit-set accuracy** (§2.4) — target > 80% for one voter. Below ~70% means either the list is incoherent (§6) or the cards lack context.
- **Rank stability** — Kendall's τ between sessions, excluding new items.
- **Seed-vs-settled divergence** — if this is near zero across users, the tracker order was already fine and the product has no reason to exist. Watch it closely; it's a kill signal ([07](07-open-questions.md)).

---

## 8. Parameter defaults (all to be measured, not trusted)

| Parameter | Default | Notes |
|---|---|---|
| Comparison noise `β` | 0.45 | Tighter than multiplayer; fit from audit accuracy |
| Prior strength `κ` | 1.5 pseudo-comparisons | |
| Decay half-life | 90 days | The one to tune hardest (§3.4) |
| Bootstrap `B` | 200 | |
| Audit fraction | 10% | |
| Max placement taps | 6 | |
| Onboarding target | ~3× item count (≈2× the floor) | 61 items → ~180 duels |
| Maintenance session | 5–10 duels | |
| Confident threshold | P > 0.95 / < 0.05 | |
| Refit | synchronous, every tap | §3.5 |
