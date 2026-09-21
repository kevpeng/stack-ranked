# 00 — Vision

> **Scope:** one product owner, one backlog, one ranked list. The multiplayer/consensus design is parked in [08](08-multiplayer-later.md) — good work, wrong first move.

## The problem, stated precisely

**1. Absolute scoring is a fiction.** RICE asks for Reach, Impact (0.25–3), Confidence, and Effort — four numbers, three of them guesses, multiplied together so the errors compound. Worse, they aren't stable *within one person across time*: the Impact score you'd give today isn't the one you gave in March. The output looks rigorous and carries about as much information as a coin flip.

**2. Dragging a list requires holding the list in your head.** This is the real constraint and it's cognitive, not motivational. To place an item correctly in a 300-row backlog by dragging, you must know what's already at rows 40–60. Nobody does. So items get dropped at the top (if someone's shouting) or the bottom (if nobody is), and the stored order below the top ~10 is noise that merely *looks* like a decision.

**3. The order goes stale silently.** A backlog ordered in March is wrong by June, and nothing in Jira tells you which parts have rotted. There's no notion of confidence, so a position set deliberately last week and one set carelessly six months ago render identically.

**4. Grooming is a chore, so it doesn't happen.** A two-hour meeting to reorder a list nobody can hold in their head. It gets skipped, and the backlog decays further.

## The core insight

**Humans are bad at absolute judgment and good at relative judgment.**

Not a hunch — it's the basis of psychophysics, of Thurstone's law of comparative judgment (1927), and of every competitive ranking system ever built. Ask someone to rate a feature's impact 1–10 and you get noise plus recency bias. Ask which of two matters more and you get a reliable answer in four seconds.

Beli productized this: log a restaurant, pick a coarse bucket, answer ~5 pairwise questions, and binary search places it exactly in a list of hundreds. Precise, effortless, weirdly addictive, and **the score is derived from the rank rather than typed.**

A backlog is the same problem. The PO already has the judgment; the tooling just never had a way to extract it that fit in working memory.

## Why one person first

The obvious version of this product is multiplayer — ten stakeholders, consensus, disagreement surfaced. That version is more exciting and much worse as a first pass.

**Single-player is faster to a settled list.** One person is ~85–90% self-consistent; ten people arguing are maybe 80% collectively. Fewer comparisons needed *and* no coordination:

- 60-item backlog, cut line settled: **~100 comparisons** at the information-theoretic floor (vs ~165 for a group), so **~180 duels** with realistic pair selection
- At 4–6 seconds per duel, that's **13–18 minutes in one sitting**

Convergence stops being something you wait two weeks for and becomes **an onboarding session**. That single fact reshapes the entire product.

**Single-player deletes most of the complexity.** Gone: vote weights, rosters, per-role aggregation, consensus reconciliation, conflict-of-interest handling, ballot-stuffing detection, Sybil resistance, and the political question of whose opinion counts. Also gone: the online/batch scoring split, because with one voter the model refits in under a millisecond on every tap.

**Single-player has a real adoption path.** The multiplayer version needs ten people to build a daily habit simultaneously — a coordination problem that kills most tools in this category. This version needs *one motivated person to enjoy a game about their own backlog.*

**Honest cost:** no network effect, no lock-in, and the product now competes with a drag handle that ships free inside Jira. See [07](07-open-questions.md).

## What Stack Ranked is

A ranking layer beside Jira or Linear that does three things:

1. **Elicits** the PO's judgment in 4-second units, using binary insertion and cut-line-focused pair selection so no tap is wasted.
2. **Maintains** the order as a model with *confidence that decays*, so the list can tell you which parts have gone stale instead of silently rotting.
3. **Writes it back** to the tracker, so the ranked order lives where the work happens.

## Positioning

> **Your judgment, at a scale your working memory can't reach.**

The tool has no opinions. It never says an item *is* important — only that *you ranked it* higher. Every number it shows is derived from a comparison you made, and every position can be drilled into: *why is this #3?* → the taps that put it there.

This matters because the failure mode of prioritization software is a confident-looking score with unexaminable provenance. We are the opposite: the provenance *is* the product.

## Where it sits

| Category | Examples | What they do | Gap |
|---|---|---|---|
| Issue trackers | Jira, Linear | Store and execute work | A drag handle and a 5-value priority enum |
| Idea boards | Canny, Productboard | Collect requests, count votes | Measures enthusiasm, not tradeoffs; free votes → everything trends up |
| Scoring frameworks | RICE/WSJF sheets, Airfocus | Structured absolute scoring | Garbage-in numbers nobody recalibrates |
| Estimation | Planning Poker | Relative *effort* sizing | Proves relative comparison works — but only for effort, only with a group, only at sprint planning |
| **Stack Ranked** | — | Continuous pairwise ranking of one owner's backlog | Fits working memory; confidence decays; writes back |

The closest conceptual neighbor is **Planning Poker**, which already proves an org will do relative comparison as a ritual. This is that, for value, solo, asynchronous, continuous.

## Why now

- **Tracker APIs are good.** Mirroring a Linear or Jira backlog is a week, not a quarter.
- **The mechanic is culturally legible.** Beli, Letterboxd, tier lists, Elo, bracket season. Nobody under 45 needs pairwise comparison explained.
- **Single-player AI-era tooling is an accepted purchase.** A PO can adopt a personal tool without a committee, a procurement cycle, or ten colleagues agreeing.

## Who it's for (v1)

**One PO, PM, or founder** who owns a backlog of 50–400 live items in Jira or Linear, has real opinions about order, and currently can't express them past the top ten.

**Not for v1:** teams wanting consensus (that's [08](08-multiplayer-later.md)), backlogs under ~30 items (just drag them), agencies (priority is contractual, not discovered).

## Non-goals

- **Not a tracker.** We mirror. Tickets live in Jira/Linear.
- **Not a roadmap or delivery tool.** No Gantt, no sprints, no capacity planning.
- **Not a consensus engine — yet.** One owner, one list. Multiplayer is an expansion, and the schema stays forward-compatible for it ([05](05-architecture.md)).
- **Not a customer-facing portal.**
- **Not an AI that prioritizes for you.** The pitch is *your judgment, efficiently elicited*. An LLM guessing at priority is precisely the thing being replaced. LLMs may summarize a ticket onto a duel card or spot duplicate requests. They don't rank.

## The bet, and how we'd know we're wrong

**The bet:** a PO will sit for a 15-minute ranking session, the resulting order will be better than what's in their tracker today, and maintaining it will feel like a game rather than a chore.

**Falsifiable fast:** if POs abandon the onboarding session halfway, or look at the settled list and shrug because it matches what Jira already said, this is a toy. Both are testable by hand, on a real backlog, in a week — before any code. Kill criteria in [07](07-open-questions.md).
