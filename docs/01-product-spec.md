# 01 — Product Spec

## Personas

| Persona | Role | What they want | How often they touch it |
|---|---|---|---|
| **Priya — PM** (owner/buyer) | Owns a product area and its backlog order | To walk into planning with evidence instead of opinions; to stop relitigating the same three features | Daily-ish in the web app; runs the ladder |
| **Sam — AE, Sales** (requester/voter) | Files feature requests on behalf of deals | His deal-blocking request to actually go somewhere; to know where it stands without asking Priya | 30 seconds/day in Slack; never opens Jira |
| **Devon — Eng Lead** (voter/skeptic) | Delivers the work, has the cost model | Effort reality to enter the conversation before commitments are made | A few minutes/week; deeply skeptical of "gamified" anything |
| **Ana — Head of Product** (consumer) | Oversees several areas | Cross-team visibility; to see where orgs disagree before it becomes a conflict | Weekly; reads, rarely votes |

**Design consequence:** Sam and Devon will never come to the web app. If the voting experience isn't inside Slack, the product has one user, and one user cannot produce a multiplayer ranking. Slack is not a "nice-to-have integration"; it is the primary client.

## Core objects

- **Ladder** — a scoped ranked list. Defined by a filter over the tracker (a Linear filter or Jira JQL), plus an *axis*, a roster of voters with weights, and a season. Typically 20–150 items. **The most important design constraint in the product: you never rank the whole backlog.** Comparing an infra chore to a marketing landing page is not a question anyone can answer, and asking it produces noise that pollutes the model.
- **Item** — a mirror of a Jira/Linear ticket, plus derived state (tier, rank, score, uncertainty, disagreement index).
- **Duel** — one presented pair, awaiting a response. Has a *reason for existing* (insertion / information gain / cut-line / challenge / audit) which is recorded, because it changes how the response should be weighted and lets us audit selection bias.
- **Comparison** — the immutable recorded outcome of a duel.
- **Request** — an intake artifact: a problem statement, evidence, and a requester. Becomes an Item once placed.
- **Season** — a bounded period (usually a quarter). Rankings carry over with decayed confidence; the season gives a natural moment to re-validate and to recap.
- **Override** — a PM's explicit re-placement of an item, with a required reason, recorded and displayed alongside the model's position.

## Axes

A ladder ranks on exactly one axis. Two ship in scope:

- **Ship First** (default) — *"Which should we ship first?"* This deliberately bundles value, urgency, and cost, because that's the actual decision. One question, no decomposition, minimal cognitive load.
- **Effort** — *"Which is the bigger build?"* Answered by engineers only. Pairwise relative sizing is strictly easier and more accurate than story points, and it gives us a cost dimension for free.

With both, `Value ÷ Effort` yields a defensible priority score with no one ever having typed a number. This is RICE's output without RICE's fiction. **Effort is a Phase 2 feature** — ship the single-axis version first and confirm people will vote at all.

Deliberately *not* shipping: separate Reach / Impact / Confidence ladders. Decomposition multiplies the number of duels by 3–4× for a marginal accuracy gain, and it reintroduces the "what does Impact mean" ambiguity we're trying to escape.

## The four loops

### 1. Intake loop — "pay to play"

Anyone can request a feature. But a request does not enter the backlog by being typed; **it enters by being placed.**

```
Sam: /stackrank request
  → form: What's the problem? Who's affected? Evidence? (links, deal, ticket)
  → dedupe check (embedding similarity against existing items; "Is this the same as FEAT-231?")
  → coarse tier: Now / Next / Later
  → 4–6 duels against existing items in that tier (binary insertion)
  → "FEAT-902 entered the Q3 Growth ladder at #14 of 61. Priya has been notified."
```

This is the single most important design decision in the product. It:
- makes the requester experience the tradeoff (you want this above the SSO work? *really?*),
- yields a provisional rank immediately instead of the silence that makes requesters feel ignored,
- generates ~5 comparisons of fresh signal from someone who was previously just noise in a Slack channel,
- and costs the PM nothing.

Total time for Sam: ~90 seconds. Compare to today, where he pastes into #product-requests and it evaporates.

### 2. Daily duel loop — the habit

```
Slack DM, 9:30am local:
  "5 duels, 30 seconds. Q3 Growth ladder is 71% settled. 🔥 12-day streak"
  [card] [card] [card] [card] [card]
  → "Done. Ladder moved to 74%. Your vote broke the tie on FEAT-118."
```

Constraints that make it work:
- **Five duels, hard cap** by default. Never an infinite feed. Ending on "done" is what produces a streak; ending on fatigue is what produces churn.
- Pairs are chosen by expected information gain, weighted toward the cut line (see [02](02-ranking-model.md)).
- One DM per person per day maximum, in their local morning, skippable and snoozable forever from the card itself.

### 3. Challenge loop — reprioritization

Any item can be challenged by anyone, from the web app, Slack, or a Jira/Linear comment (`/stackrank challenge`).

```
Devon: "FEAT-118 is way too high — it's ranked #4 and it's a month of work."
  → Challenge opens on FEAT-118
  → System schedules targeted duels: FEAT-118 vs #2, #3, #6, #9 (its neighbors + the items it would displace)
  → Those duels go out to the ladder roster in the next daily batch
  → 48h later: resolution. "FEAT-118 moved #4 → #11. Challenge upheld."
     or "FEAT-118 held at #4. Challenge rejected 7–2."
```

Challenges are the mechanism for *reprioritization* — the user's second core scenario. They're also the pressure valve that keeps the ranking from feeling imposed: if you think it's wrong, there is a defined, fast, legitimate way to contest it, and the outcome is binding-ish rather than a Slack argument.

Rate limit: 1 open challenge per person per ladder, to prevent challenge-spam as a filibuster.

### 4. Decision loop — what Priya actually does

Weekly, or before planning:

```
Open ladder → see order, cut line, contested items, what moved since last week
  → resolve the 3 contested items (10-minute agenda, with the disagreement data on screen)
  → override where she has information the ladder doesn't ("legal requires this by Nov"), with a reason
  → Preview & Apply → order written back to Linear/Jira, reversible
```

## Screens

### The Duel card (the product's atomic unit)

Everything depends on this card. If it takes more than ~6 seconds to answer, the loop dies. If it has too little context, the answer is noise. That tension is the central UX problem.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Q3 Growth ladder · duel 2 of 5                            🔥 12     │
│                                                                      │
│              Which should we ship first?                             │
│                                                                      │
│ ┌───────────────────────────┐  ┌───────────────────────────┐         │
│ │ FEAT-118                  │  │ FEAT-402                  │         │
│ │ Bulk CSV export           │  │ SSO for enterprise tier   │         │
│ │                           │  │                           │         │
│ │ Ops teams re-key data by  │  │ 3 enterprise deals list   │         │
│ │ hand every Monday; ~6h/wk │  │ SAML as a hard blocker    │         │
│ │                           │  │                           │         │
│ │ 🏷 ops  ⏱ ~1w  👤 Sam (AE) │  │ 🏷 security ⏱ ~4w 👤 Priya│         │
│ │ 💬 4 customers  📅 41d old │  │ 💰 $220k ARR  📅 12d old  │         │
│ └───────────────────────────┘  └───────────────────────────┘         │
│      [ ← This one ]                  [ This one → ]                  │
│                                                                      │
│       [ Too close to call ]   [ Need context ]   [ Skip ]            │
└──────────────────────────────────────────────────────────────────────┘
```

Card content rules:
- **Title + one-line problem statement, never the raw description.** If the ticket has no usable summary, generate one on sync (LLM, cached, editable) or flag the ticket as un-duelable until someone writes one. This is a feature: it forces ticket hygiene, and "your ticket can't be ranked because nobody can tell what it is" is a message PMs enjoy sending.
- **Evidence chips** are what make a judgment possible: customer count, ARR attached, requester + role, age, effort estimate if known.
- **No rank, score, or vote counts shown.** Anchoring destroys the independence of the comparison — if I can see it's ranked #3, I'll vote for #3. This is non-negotiable and is a common mistake in similar tools.

The three secondary actions are all load-bearing:
- **Too close to call** — a genuine tie. Real information (see the tie handling in [02](02-ranking-model.md)). Without this button, indifferent people produce pure noise.
- **Need context** — records that the card was insufficient and pings the ticket owner. Converts a frustrating dead-end into backlog hygiene.
- **Skip** — "I'm not the right person to judge this." Also informative: an item skipped by most of the roster is in the wrong ladder.

### Ladder view (web)

```
Q3 Growth · 61 items · 74% settled · Season ends Sep 30       [Apply to Linear]

  #   ITEM                          SCORE  CONF   MOVE   FLAGS
  ─────────────────────────────────────────────────────────────
   1  SSO for enterprise tier         94    ███    —
   2  Onboarding checklist v2         91    ███    ▲2
   3  Bulk CSV export                 88    ██░    ▼1     ⚡ contested
   4  Usage-based billing             86    █░░    ▲7     🚨 upset
  ─────────────────────── CUT LINE · 18 pts of 22 capacity ──────
   5  Audit log                       71    ███    ▼2
   6  Mobile push notifications       68    ██░    —      ⚡ contested
   …

  Contested (3)   Needs context (5)   Unplaced (2)   Stale (4)
```

The **cut line** is the most important element on the screen. Rendering it converts an abstract ordering into a concrete "these four ship, these don't," which is what makes people care and what focuses the model's remaining uncertainty where it matters.

### Disagreement map

The feature that justifies the whole product for Priya.

```
FEAT-118 · Bulk CSV export

  Sales      ▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏  #2   (n=3)
  Support    ▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏    #4   (n=2)
  Product    ▏▏▏▏▏▏▏▏          #12  (n=2)
  Eng        ▏▏▏               #31  (n=4)
                              ↑ consensus #3

  Split index: 0.81 (top 5% most contested on this ladder)
  Likely cause: Eng voters rank it low only in duels against items
  they estimated as cheaper. → Effort may be the real disagreement.
```

"Sales says #2, Engineering says #31" is a meeting agenda item, generated automatically, with the receipts attached. Priya walks into planning with three of these instead of a 60-item list.

### Other screens (lower fidelity, Phase 1–2)

- **Item detail** — evidence, full comparison history ("beat 14, lost to 3"), who challenged it, override history, link out to the tracker.
- **Request intake** — the form from loop 1, with live dedupe.
- **Ladder admin** — filter definition, roster + weights, axis, tier config, capacity for the cut line, season dates.
- **Season recap** — shipped vs. ranked, biggest upsets, most-contested calls, who was most calibrated. A shareable end-of-quarter artifact; also the natural re-engagement moment.

## Surfaces

| Surface | Role | Phase |
|---|---|---|
| **Slack** | Voting, intake, notifications, challenges. Where ~80% of all interaction happens. | 1 |
| **Web app** | Deciding: ladder view, disagreement map, admin, apply. | 1 |
| **Email digest** | Weekly, for voters who won't install Slack apps and for execs. | 2 |
| **Linear/Jira** | Comment commands, a "Stack Score" field, deep links back. | 2 |
| **PWA / mobile web** | The true Beli feel for people who want to duel on the couch. Slack covers most of this. | 3 |

## Voice and copy

Sports ladder, not productivity software. **Duel**, **Champion**, **Upset**, **Cut line**, **Season**, **Challenge**, **Streak**, **Settled**. Short, present tense, slightly competitive. Never "leverage," "align," or "stakeholder synergy."

Emoji used with meaning, not decoration: 🔥 streak, ⚡ contested, 🚨 upset, 👑 champion, ✂️ cut line.

**One hard copy rule:** the tool never says an item *is* more important, only that people *ranked* it higher. "Ranked #3 by 11 voters" — never "Priority: high." The distinction preserves the positioning in [00](00-vision.md) and keeps us honest about what a vote actually is.
