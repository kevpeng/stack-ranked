# Stack Ranked

**Beli for feature prioritization.** Stakeholders answer one question at a time — *"which of these two should we ship first?"* — and those taps compile into a statistically sound, continuously-updated ranking of your Jira or Linear backlog.

---

## The pitch

Nobody can tell you the impact of a feature on a 1–10 scale. Everybody can tell you which of two features matters more.

Prioritization frameworks (RICE, WSJF, MoSCoW, ICE) ask for absolute numbers that humans cannot produce reliably. So teams fake the numbers, and the real decision gets made in a 60-minute meeting by whoever argues hardest. The backlog becomes a 2,000-row graveyard where everything is P2.

Beli solved the same problem for restaurants: don't ask for a score, ask for a comparison, and binary-search the item into a ranked list in ~6 taps. Stack Ranked applies that to backlogs — with the twist that backlogs are **multiplayer**. Ten people rank the same list, and where they *disagree* is the most valuable output the tool produces.

## The loop

```
   ┌──────────────┐    request or challenge a ticket
   │   INTAKE     │──────────────────────────────────────┐
   └──────────────┘                                      │
                                                         ▼
   ┌──────────────┐     "Ship first: A or B?"    ┌───────────────┐
   │  DAILY DUEL  │───────────────────────────── │  COMPARISON   │
   │  (Slack DM)  │      5 taps, 30 seconds      │    EVENTS     │
   └──────────────┘                              └───────┬───────┘
                                                         │ append-only
                                                         ▼
                                              ┌─────────────────────┐
                                              │  BRADLEY–TERRY FIT  │
                                              │  θ + uncertainty    │
                                              └──────────┬──────────┘
                                                         ▼
   ┌───────────────────────────────────────────────────────────────┐
   │  LADDER: ranked list · cut line · contested items · upsets    │
   └───────────────────────────┬───────────────────────────────────┘
                               │ explicit, previewed, reversible
                               ▼
                    ┌──────────────────────┐
                    │  Jira / Linear order │
                    └──────────────────────┘
```

## Why it isn't just an upvote board

Upvote boards (Canny, Productboard, Aha! ideas) measure **enthusiasm**. Enthusiasm is free, so everything trends up and nothing gets decided. A pairwise duel costs the voter something real: to pick A they must give up B. You cannot say "everything is P1" to a duel.

## Status

**Phase 0 — planning.** No code. These docs are the design.

| Doc | What's in it |
|---|---|
| [00 — Vision](docs/00-vision.md) | Problem, core insight, positioning, non-goals |
| [01 — Product spec](docs/01-product-spec.md) | Personas, objects, the four loops, screens, copy |
| [02 — Ranking model](docs/02-ranking-model.md) | Elicitation + aggregation math, convergence, the cut line |
| [03 — Gamification & integrity](docs/03-gamification.md) | What works, what backfires, anti-gaming |
| [04 — Integrations](docs/04-integrations.md) | Linear, Jira, Slack; sync and write-back policy |
| [05 — Architecture](docs/05-architecture.md) | Stack, schema sketch, scoring pipeline, simulation harness |
| [06 — Roadmap](docs/06-roadmap.md) | Phasing, milestones, success metrics, scope cuts |
| [07 — Open questions](docs/07-open-questions.md) | Decisions needed, risks, kill criteria |

## One-line summary of the design bet

> Elicit with binary insertion (fast, fun, Beli-like). Aggregate with Bradley–Terry (honest, multiplayer, uncertainty-aware). Spend your comparisons where the decision actually is — at the cut line. Never let the tool make the call; make it impossible for the PM to make the call uninformed.
