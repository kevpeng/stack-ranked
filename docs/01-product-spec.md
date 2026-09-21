# 01 — Product Spec

> Scope: one PO owns the list. Everyone else can *file*, nobody else *ranks*.

## The user

**Priya — Product Owner.** Owns 50–400 live items in Linear or Jira. Can rank her top 10 honestly; below that the order is inherited guesswork. Gets ~10 inbound requests a week from sales, support, and engineering, which she triages by feel and mostly defers. Dreads grooming. Has to justify the order in planning and currently does it from memory and conviction.

She is the buyer, the user, and the only voter. Every design decision optimizes for her sitting down voluntarily.

**Secondary (non-ranking):** requesters — anyone who files. They get a lightweight intake form and a notification when their item lands. They never see a duel.

## Core objects

- **List** — the ranked backlog. Defined by a tracker filter (Linear filter / Jira JQL), plus a capacity for the cut line. One PO may own several (one per product area); each is independent.
- **Item** — a mirrored ticket + derived state (tier, rank, score, confidence).
- **Duel** — one presented pair. Records *why* it was asked (placement / cut-line / staleness / audit), which matters for tuning and honest measurement.
- **Comparison** — the immutable outcome of a duel.
- **Unplaced queue** — items synced from the tracker that have never been ranked. The app's main call to action.
- **Pin** — the PO declaring a position directly ("this is #1 because legal says so"), overriding the model.

## Why not just drag things in Jira?

The question the product must answer in its first thirty seconds. The answer:

> Dragging requires you to know what's already at rows 40–60. Comparing two items doesn't.

Everything below follows from that one sentence. If a screen ever asks Priya to hold more than two items in her head at once, it's wrong.

## The three loops

### 1. Onboarding — rank the backlog in one sitting

The signature experience, and the thing single-player makes possible.

```
Connect Linear → pick a filter → 61 items found
  → seed the order from Linear's existing rank + priority  ("Seeded, 0% confident")
  → "Rank your backlog: ~180 duels, about 15 minutes. You can stop anytime."
  → [duel] [duel] [duel] ... progress bar climbing
  → SETTLED. And the payoff:

     ┌──────────────────────────────────────────────────────┐
     │  Your stored order and your judgment disagree on      │
     │  34 of 61 items.                                      │
     │                                                       │
     │  9 items you had below the cut line belong above it.  │
     │  Biggest mover:  Audit log        #38 → #6            │
     │  Biggest drop:   Dashboard v2     #4  → #29           │
     │                                    [See the diff] →   │
     └──────────────────────────────────────────────────────┘
```

This is the whole first-session value proposition and it's essentially free — it falls out of comparing the seeded order to the settled one ([02 §5](02-ranking-model.md)).

Design requirements for the session to survive ~180 duels:
- **Resumable at any point.** Progress saved per tap. "Stop anytime" must be true, and the partial result must already be useful.
- **Visible progress with a real finish line**, driven by confidence, not raw count.
- **Ramping difficulty.** Early duels are wide-apart, obvious, fast — building momentum. Later ones narrow toward the cut line.
- **No timer, no streak pressure, no interruption.** This is a focused sitting, not a habit moment.

### 2. Intake — triage becomes taps

Requests arrive from anywhere: a Slack form, a Jira ticket with a label, an email. They land in the **Unplaced queue**, not in the ranked list.

```
Unplaced (12)
  → open one: problem, requester, evidence, effort if known
  → coarse tier: Now / Next / Later / Never          ← Never = archive, one tap
  → 4–6 duels within that tier (binary insertion)
  → "FEAT-902 → #14 of 61. Above 'Audit log', below 'SSO for enterprise'."
```

The reframe that makes this work: **triaging 12 requests is a dreaded queue; 12 × 5 taps is a five-minute game.** Same work, entirely different feel, and the output is a real position instead of a priority label.

`Never` as a one-tap archive is quietly one of the most valuable actions in the product. Backlogs grow monotonically because nothing has a cheap "no." This gives it one.

### 3. Maintenance — two minutes a day

Confidence decays ([02 §3.4](02-ranking-model.md)), so the list knows which parts have gone stale without anyone tracking it.

```
"Your list is 84% confident. 6 duels to get back to 90%."
  → 6 duels, mostly around the cut line and on items that haven't
    been compared since the list changed under them
  → done
```

The decay is what makes this loop exist at all. Without it there's no reason to open the app on day 40, and the product is a one-shot utility. With it, the list gently asks for attention proportional to how much the backlog actually moved.

### Decision moment (not a loop — a destination)

Before planning: open the list, see the cut line, see what moved since last week, pin anything the model can't know ("legal requires this by Nov"), hit **Apply** to write the order back to the tracker.

## Screens

### The Duel card — the atomic unit

If this takes more than ~6 seconds, the ~180-duel session never finishes. If it carries too little context, the answer is noise. That tension is the central UX problem of the product.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Q3 Backlog · 84 of ~180                    ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  68%   │
│                                                                      │
│              Which ships first?                                      │
│                                                                      │
│ ┌───────────────────────────┐  ┌───────────────────────────┐         │
│ │ FEAT-118                  │  │ FEAT-402                  │         │
│ │ Bulk CSV export           │  │ SSO for enterprise tier   │         │
│ │                           │  │                           │         │
│ │ Ops re-key data by hand   │  │ 3 enterprise deals list   │         │
│ │ every Monday, ~6h/week    │  │ SAML as a hard blocker    │         │
│ │                           │  │                           │         │
│ │ 🏷 ops   ⏱ ~1w            │  │ 🏷 security  ⏱ ~4w        │         │
│ │ 👤 Sam (AE)   📅 41d      │  │ 💰 $220k ARR  📅 12d      │         │
│ └───────────────────────────┘  └───────────────────────────┘         │
│      [ ←  This one ]                  [ This one  → ]                │
│                                                                      │
│        [ Too close to call ]      [ Skip ]      [ Edit ticket ]      │
└──────────────────────────────────────────────────────────────────────┘
```

**Content rules:**
- **Title + one usable line, never the raw description.** If a ticket has no summary worth reading, generate one on sync (cached, editable) or mark it un-duelable until Priya writes one. This is friction at the wrong moment *and* it's the honest answer: an item nobody can describe can't be ranked.
- **Evidence chips** are what make judgment possible: requester, age, effort, customers, ARR.
- **Never show rank or score on the card.** Anchoring — if she can see it's #3 she'll pick #3 and the model just re-learns its own output. This is the most common mistake in tools of this shape and it silently destroys the data.

**Keyboard-first.** `←` `→` to pick, `space` for too-close, `s` to skip. A 180-duel session is unbearable with a mouse and genuinely pleasant with two arrow keys. This is not a nice-to-have; it's the difference between finishing and quitting.

**"Too close to call"** is load-bearing. Real ties are real information ([02 §3.3](02-ranking-model.md)). Without the button, indifference gets recorded as preference and the model fits noise.

### List view

```
Q3 Backlog · 61 items · 84% confident · 12 unplaced        [Apply to Linear]

  #   ITEM                          SCORE  CONF   MOVE    
  ───────────────────────────────────────────────────────
   1  SSO for enterprise tier         94    ███    —      📌
   2  Onboarding checklist v2         91    ███    ▲2
   3  Bulk CSV export                 88    ██░    ▼1
   4  Usage-based billing             86    █░░    ▲7     ← low confidence
  ──────────────── CUT LINE · 18 of 22 points ───────────
   5  Audit log                       71    ███    ▼2
   6  Mobile push                     68    ██░    —
   …
                                                          
  [ 12 unplaced ]  [ 5 need a summary ]  [ 4 stale ]
```

The **cut line** is the most important element. It converts an abstract ordering into "these four ship, these don't," which is what makes the ranking worth maintaining and what tells the model where to spend the next taps.

The **confidence column** is the second most important. It's what a drag-ordered Jira backlog can never show: *which parts of this order do I actually believe?*

### Item detail

Evidence, the comparison history (*"beat 14, lost to 3"* — with the actual pairs listed), current confidence, pin control, link to the tracker. The answer to "why is this #3" is always one click away and is always a list of taps Priya made herself.

### Other screens

- **Unplaced queue** — the main call to action, with a count badge.
- **The diff** — seeded vs. settled order, and current vs. last-applied.
- **Settings** — filter, capacity, decay rate, tracker connection, write-back mode.

## Voice

Sports ladder, lightly. **Duel**, **cut line**, **unplaced**, **confident**, **stale**, **pin**. Short, present tense. Never "leverage," "align," "stakeholder."

**One hard copy rule:** the tool never says an item *is* important — only that *you ranked it* there. "#3 of 61, from 23 comparisons" — never "Priority: High." That distinction is the positioning in [00](00-vision.md), and it's the difference between a tool Priya trusts and one more score she has to defend.
