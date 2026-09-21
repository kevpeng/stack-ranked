# 08 — Multiplayer, Later

> **Not the plan.** Scope is one PO, one list ([00](00-vision.md)). This doc parks the consensus design so it isn't re-derived later, and records what the current schema must preserve to make it additive rather than a rewrite.

## Why it's parked, not cancelled

The multiplayer version is the more exciting product and the worse first move:

| | Multiplayer | Single-player |
|---|---|---|
| Comparisons to settle a 60-item cut line | ~165 | ~100 |
| Time to a settled list | 8–12 days of daily voting by 10 people | one ~15 min sitting |
| Hardest problem | **ten people building a daily habit simultaneously** | one person enjoying a game |
| Complexity | weights, rosters, consensus, anti-gaming, identity mapping, batch scoring | none of it |

The coordination problem in that third row kills most tools in this category. Single-player removes it entirely, and the revenue path runs *through* it: a PO who already loves the tool is a far easier sell on "invite your stakeholders" than a cold team is on "everybody vote daily."

## What the multiplayer version adds

**The real product is disagreement, not consensus.** The ranking is table stakes; the output that justifies a team plan is:

```
FEAT-118 · Bulk CSV export

  Sales      ▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏  #2   (n=3)
  Support    ▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏▏    #4   (n=2)
  Product    ▏▏▏▏▏▏▏▏            #12  (n=2)
  Eng        ▏▏▏                 #31  (n=4)
                                 ↑ consensus #3
  Split index: 0.81 (top 5% most contested)
```

"Sales says #2, Engineering says #31" is a meeting agenda item, generated automatically, with receipts. A PO walks into planning with three of those instead of a 60-item list. Nothing in the single-player product does this, and nothing else on the market does either.

Also unlocked: stakeholders *voting* rather than only filing; challenge flows (contest a rank, trigger targeted duels, get a binding-ish resolution); seasons and recaps.

## What changes in the model

Additive to [02](02-ranking-model.md), not a replacement:

- **Voter weights** — weight each comparison's likelihood term by `w_v`. Visible to everyone; a hidden weighting scheme discovered later is a trust catastrophe.
- **Per-role fits** — refit restricted to each role's comparisons, shrunk toward consensus. Powers the disagreement map. Same machinery as the personal-ladder view.
- **Personal ladders** — refit on one voter's comparisons with strong shrinkage toward consensus. A *view*, never a separate object: nobody has enough comparisons for a standalone fit.
- **Per-voter noise `τ_v`** — `P(v picks i) = σ((β_i − β_j)/τ_v)`, fit by EM. Inconsistent voters are down-weighted automatically, with no human making an awkward call about whose opinion counts.
- **Shorter decay half-life** (~60 days) — groups turn over and shift faster than individuals.
- **Higher noise `β`** — ~0.6 vs 0.45. Ten people disagreeing is noisier than one person being inconsistent.

## What comes back that single-player deleted

Recorded so the cost of multiplayer is honest, not rediscovered:

- **Identity mapping.** Sales and Support are among the most valuable voters and frequently have **no tracker seat**. Invite-by-email voters, role assignment, weight defaults, admin approval. An entire subsystem.
- **Slack as primary client.** Ten stakeholders will not open a sixth tab. Voting must live where they already are.
- **The online/batch scoring split.** Many voters × many ladders means inline refits stop being free: online Elo for instant feedback, batch MAP fit as authoritative, plus the divergence bug class that comes with running two systems.
- **The whole integrity chapter.** Rate limits, conflict-of-interest flags and down-weighting, speed traps, ballot-stuffing detection, Sybil resistance, audit transparency. Rankings that influence roadmaps are worth manipulating, and none of this is optional once there's more than one player.
- **Calibration scoring, carefully.** "How often do you agree with consensus" rewards *conformity* and penalizes exactly the person worth listening to. Only safe forms: score against shipped outcomes, against held-out comparisons, or reward informativeness. Never a public leaderboard of whose judgment counts — that's organizational dynamite.
- **The "PM doesn't want a democracy" adoption risk.** Advisory output, first-class overrides with recorded reasons, explicit Apply. The single-owner scope makes this vanish; multiplayer brings it back as the central adoption question.

## What the current design must preserve

Cheap now, expensive later. All three are already in [05](05-architecture.md):

1. **`voter_id` on `comparisons`.** Present from day one despite there being one voter. `comparisons` is the one table that can't be regenerated, so retrofitting an identity column across it is the expensive kind of migration.
2. **`org_id` and row-level tenancy** enforced at the query layer. Needed anyway; painful to add under load.
3. **Append-only comparisons.** Adding voters is then just more rows, and every historical ranking stays replayable.

The `ratings` table is deliberately *not* versioned in single-player ([05](05-architecture.md), decision 3). Multiplayer will want `rating_runs` snapshots back to explain week-over-week movement across a changing roster — that's an additive table, not a migration, so it's correctly deferred.

## Trigger for revisiting

Not a date. Revisit when single-player retention is proven (return-within-14-days above ~50%) **and** users are actively asking for stakeholder voting. Building it before the first condition means inheriting every problem this scope cut removed, while still not knowing whether anyone wants the core loop.
