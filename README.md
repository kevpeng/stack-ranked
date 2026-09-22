# Stack Ranked

**Beli for your backlog.** One product owner, one ranked list. Answer *"which of these two ships first?"* a few dozen times and your Jira or Linear backlog comes out actually ordered — then stays ordered for about two minutes a day.

---

## The pitch

You own a 300-item backlog. You can honestly rank the top 10. Below that, the order is fiction — stored in Jira, unexamined since March, and indefensible when someone asks why #7 is above #12.

The problem isn't laziness, it's working memory. **Dragging a list requires holding the whole list in your head. Comparing two items doesn't.** So the list never gets ordered, and "backlog grooming" becomes a two-hour meeting that everyone survives rather than finishes.

Beli solved exactly this for restaurants: never ask for a score, ask which of two was better, and binary-search the item into place in ~6 taps. The score is derived from the rank, never typed. Stack Ranked does that to a backlog.

## Why single-player is the right first pass

The math works out much better than the committee version:

| | Multiplayer | **Single-player** |
|---|---|---|
| Comparisons to settle the cut line (60 items) | ~165 | **~100** |
| Why | 10 people disagree; noise is high | One person is self-consistent (~85–90%) |
| Time to a settled list | 8–12 days of daily voting | **one 15-minute sitting** |
| Hardest problem | getting 10 people to vote daily | getting 1 person to enjoy it |

That last row is the whole argument. A single motivated PO ranking their own backlog will sit for ~180 duels the way they'd sit to import a library into Letterboxd. **Convergence stops being a waiting game and becomes an onboarding session.**

> ⚠️ **The ~100 and ~180 figures above are unsupported by simulation.** Measured convergence is far slower: no list size reached the 90% confidence target within 5–15× the predicted floor. The ranking itself is sound — the defect is in the stopping rule and the progress metric layered on top. See [09 — Simulation findings](docs/09-simulation-findings.md).

It also deletes most of the complexity: no vote weights, no roster, no consensus, no anti-gaming (you can't cheat a game you play against yourself), no per-role aggregation, and no reason to split scoring into online + batch — with one voter the model refits in under a millisecond on every tap.

## The loop

```
   ONBOARDING (once, ~15 min)          MAINTENANCE (~2 min/day)
   ┌─────────────────────────┐         ┌──────────────────────────┐
   │ seed order from Jira    │         │  new requests land in    │
   │          ↓              │         │  the Unplaced queue      │
   │ ~180 duels              │         │          ↓               │
   │          ↓              │         │  place each: ~4-6 taps   │
   │ SETTLED LIST + the      │         │          ↓               │
   │ diff vs. what Jira said │         │  a few maintenance duels │
   └─────────────────────────┘         │  where confidence decayed│
                                       └──────────────────────────┘
                     │                              │
                     └──────────────┬───────────────┘
                                    ▼
                    ranked list · cut line · write back to tracker
```

## The first-session payoff

You seed from your existing Jira order, do ~180 duels, and the app shows you:

> **Your stored backlog order and your actual judgment disagree on 34 of 61 items.**
> 9 items you'd ranked below the cut line belong above it.

That's the aha, it lands in the first fifteen minutes, and it's free — it falls straight out of comparing the seeded order to the settled one.

## Ranking is single-player. Intake doesn't have to be.

Anyone can throw a request at the backlog — Slack, a Jira ticket, a form. **Only the PO ranks.** This keeps the wedge tight while preserving the most useful multiplayer bit: triaging 40 inbound requests stops being a dreaded queue and becomes 40 × 5 taps.

## Run it

```bash
npm install
npm run db:seed     # 60-item demo backlog
npm run dev         # http://localhost:3000
```

No database to install and no credentials — PGlite runs Postgres in WASM on
disk. See [10 — Running & deploying](docs/10-running-and-deploying.md) for
Vercel (which needs a real Postgres: PGlite's local filesystem does not
survive on serverless).

## Status

**MVP built.** Bradley-Terry engine, 8 API routes, keyboard-first duel
session, ranked list with cut line, seed-vs-settled diff, 60-item fixture
backlog, 36 tests, simulation harness. No tracker integration yet — see
[06 — Roadmap](docs/06-roadmap.md).

| Doc | What's in it |
|---|---|
| [00 — Vision](docs/00-vision.md) | Problem, why pairwise, positioning, non-goals |
| [01 — Product spec](docs/01-product-spec.md) | The PO, the three loops, screens, copy |
| [02 — Ranking model](docs/02-ranking-model.md) | Elicitation + aggregation, why BT survives single-player |
| [03 — Gamification](docs/03-gamification.md) | Single-player mechanics; what backfires |
| [04 — Integrations](docs/04-integrations.md) | Linear, Jira; sync and write-back |
| [05 — Architecture](docs/05-architecture.md) | Stack, schema, inline scoring, simulation harness |
| [06 — Roadmap](docs/06-roadmap.md) | Phasing, metrics, scope cuts |
| [07 — Open questions](docs/07-open-questions.md) | Decisions needed, risks, kill criteria |
| [08 — Multiplayer, later](docs/08-multiplayer-later.md) | The consensus design, parked but not lost |
| [09 — Simulation findings](docs/09-simulation-findings.md) | **Measured results — two docs/02 claims did not survive** |
| [10 — Running & deploying](docs/10-running-and-deploying.md) | Local setup (3 commands) and Vercel |

## The design bet

> Elicit with binary insertion (fast, fun, Beli-like). Aggregate with Bradley–Terry anyway — not to reconcile people, but to survive *your own* inconsistency and to let confidence decay so the list knows when it's gone stale. Spend taps at the cut line. Make one person's afternoon produce a backlog order they'd defend in a meeting.
