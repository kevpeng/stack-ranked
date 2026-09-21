# 00 — Vision

## The problem, stated precisely

Prioritization fails for three separate reasons, and most tools only address the third.

**1. Absolute scoring is a fiction.** RICE asks for Reach (how many users, per quarter), Impact (0.25–3), Confidence (%), and Effort (person-months). Four numbers, three of which are guesses, multiplied together — which compounds the error. Worse, the numbers aren't calibrated *across people*: Sam's "Impact: 3" and Devon's "Impact: 3" mean different things, and neither is stable week to week. The output has the appearance of rigor and the information content of a coin flip.

**2. The backlog is write-only.** A 2,000-item Jira backlog is not a prioritized list; it's a landfill with a search box. Nothing gets removed, everything is P2 or P3, and the true ordering lives in the PM's head or in a separate spreadsheet that goes stale in nine days.

**3. The decision is dominated by presence and volume.** The features that get built are the ones whose advocate was in the room, escalated most recently, or had the biggest logo attached. The quietest-but-correct opinion in the company never makes it into the decision.

## The core insight

**Humans are bad at absolute judgment and good at relative judgment.**

This is not a hunch; it's the foundation of psychophysics, of comparative judgment (Thurstone, 1927), and of every ranking system in competitive sports. Ask someone to rate a restaurant 1–10 and you get noise plus recency bias. Ask which of two restaurants was better and you get a reliable signal in under three seconds.

Beli productized this. You log a restaurant, pick a coarse bucket (liked it / it was fine / didn't), then answer ~5 pairwise questions. Binary search places it exactly in a list of hundreds. The score is *derived from* the rank, never entered. The result is precise, effortless, and weirdly addictive.

**A backlog is the same problem with one extra dimension: it's multiplayer.** Beli builds *your* list. A product org needs *one* list built from many people who genuinely disagree — and the disagreement is signal, not noise to be averaged away.

## What Stack Ranked is

A prioritization layer that sits beside Jira or Linear and does three things:

1. **Elicits** preference in 3-second units, wherever people already are (Slack), using binary insertion and adaptive pair selection so no tap is wasted.
2. **Aggregates** those taps into a ranked backlog using a Bradley–Terry model — with per-voter weights, uncertainty estimates, and time decay — so the ranking is defensible rather than vibes-based.
3. **Surfaces the disagreement**: where Sales and Engineering rank the same item 40 positions apart, that's the agenda for the next prioritization meeting. The tool's job is to make that conversation 10 minutes instead of 60.

And one thing it deliberately does not do: **decide.** See non-goals.

## Positioning

> **Decision input, not decision maker.**

This framing is load-bearing for adoption. A tool that tells a PM what to build will be rejected by the PM, who is accountable for the outcome and correctly unwilling to outsource that to a vote. A tool that makes it impossible for the PM to decide *uninformed* — that shows them, in 30 seconds, what ten stakeholders actually believe and where they split — is one the PM will champion.

Every feature gets checked against this line. Auto-applying rankings to Jira: violates it. Showing the PM a one-click override with a recorded rationale: honors it.

## Where it sits in the landscape

| Category | Examples | What they do | Gap we fill |
|---|---|---|---|
| Issue trackers | Jira, Linear | Store and execute work | No opinion on order beyond a drag handle |
| Idea/upvote boards | Canny, Productboard, Aha! Ideas | Collect requests, count votes | Votes are free → no forced tradeoff; loudest-customer bias |
| Scoring frameworks | RICE/WSJF spreadsheets, Airfocus | Structured absolute scoring | Garbage-in numbers, nobody recalibrates |
| Estimation | Planning Poker, Scrum Poker | Relative *effort* sizing | Only effort, only engineers, only at sprint planning |
| **Stack Ranked** | — | Continuous pairwise ranking of value (and optionally effort) across all stakeholders | Forced tradeoffs, multiplayer, statistically grounded, low-friction |

The nearest neighbor conceptually is **Planning Poker**, which already proves an engineering org will do relative comparison as a ritual. Stack Ranked is that, for value, asynchronous, and continuous.

## Why now

- **Tracker APIs are good.** Linear's GraphQL API and webhooks are excellent; Jira Cloud's REST + Agile APIs are workable. Mirroring a backlog is a solved problem in 2026, not a six-month project.
- **Slack is a real app surface.** A two-button Block Kit card in a DM is the entire voting UI. The friction of "go to another tool" — which killed a generation of prioritization products — is gone.
- **The mechanic is culturally legible.** Beli, Letterboxd ranking, Elo, March Madness brackets, tier lists. You no longer have to explain pairwise comparison to anyone under 45.

## Who it's for (v1)

A **20–300 person product org** with:
- A real backlog (100+ live items) in Jira or Linear
- 3–20 stakeholders per product area who have opinions and currently express them in meetings
- A PM or EM who owns the order and is tired of defending it

The buyer is the Head of Product or a senior PM. The daily user is a stakeholder who never opens Jira.

**Not for v1:** solo founders (no disagreement to resolve), 1,000+ person orgs (need SSO/SOC2/audit we won't have), agencies and client work (priorities are contractual, not discovered).

## Non-goals

Explicit, so we can say no later:

- **Not a roadmap or delivery tool.** No Gantt charts, no capacity planning, no sprint boards. Jira and Linear do that.
- **Not a system of record.** Tickets live in the tracker. We mirror; we never become the place where the ticket truly is.
- **Not a democracy.** The ranking is advisory. The PM can override anything and the override is first-class (with a recorded reason), not a hack.
- **Not a customer-facing portal.** v1 is internal stakeholders only. Customer-facing voting is a different product with different abuse dynamics.
- **Not an AI that prioritizes for you.** LLM assistance is fine for summarizing a ticket onto a duel card or clustering duplicate requests. It does not get a vote. The value proposition is *human judgment, efficiently elicited*; a model guessing at priority is the thing we're replacing, not the thing we're building.

## The bet, and how we'd know we're wrong

**The bet:** teams will do 5 comparisons a day for weeks, and the resulting order will be good enough that a PM changes a real decision because of it.

**Falsifiable within 6 weeks of a design partner:** if median voter engagement collapses below 2 sessions/week by week 3, or if the PM looks at the settled ranking and says "yeah, that's what I already thought" every single time, the product is a toy. See [07 — Open questions](07-open-questions.md) for kill criteria.
