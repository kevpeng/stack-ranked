# 06 — Roadmap

## Phase 0 — Validate (1–2 weeks, no code)

These docs are most of it. The rest:

**Five design-partner conversations.** PMs at 20–300 person orgs on Jira or Linear. Not demos — interrogations. Specifically:
- Show them their own backlog and ask them to rank the top 15 from memory. Then ask two colleagues. **Measure the disagreement.** If three people produce roughly the same list, this org doesn't need the product and neither do the others like it.
- "How was the last real prioritization decision actually made?" Listen for the meeting, the escalation, the loudest voice.
- "Who has an opinion that never makes it into the room?"

**A paper prototype of the duel card.** Twenty real pairs from their real backlog, in Figma or literally on cards. Watch them answer. This tests the single riskiest assumption in the product: *is a duel answerable in six seconds with only what fits on a card?* If they keep saying "I'd need to know more" — that's the finding, and it changes the design before anything is built.

**A hand-run ladder.** Pick a partner, take 40 of their tickets, run comparisons by hand in Slack for a week, compute the Bradley–Terry fit in a spreadsheet or a throwaway script. Show them the result and the disagreement map. This is a week of work and it validates or kills the entire thesis before engineering starts.

**Exit criteria:** at least 3 of 5 partners show real internal disagreement, at least 2 commit to a pilot, and the paper duel test clears 70% answered-without-hesitation.

---

## Phase 1 — MVP (6 weeks)

**Thesis under test: will people actually vote, and is the resulting order good enough to change a decision?**

Scope, Linear only:

| Week | Deliverable |
|---|---|
| 1 | **Simulation harness + scoring engine.** BT/MM, prior, bootstrap, Elo, settled metric, selection policies. Fully validated offline, no UI. |
| 2 | Linear OAuth + sync (webhook + reconciler). Spike checklist from [04](04-integrations.md) cleared. |
| 3 | Ladder model, duel queue generation, vote API, ladder view (web). |
| 4 | **Slack app:** duel cards, daily DM, `/stackrank`, App Home. The real client. |
| 5 | Intake flow (request → place → provisional rank), challenge flow, streaks, progress bar. |
| 6 | Stack Score write-back, ladder admin, onboarding, internal dogfood on our own backlog. |

**In scope:** one axis (Ship First), tiers, insertion + infogain + cutline + audit selection, BT with weights/decay/ties, bootstrap CIs, cut line, upsets, streaks, settled %, Slack voting, score write-back.

**Explicitly out:** Jira, effort ladders, disagreement map, order write-back, seasons, calibration scores, email, public API, mobile app, SSO beyond Slack/Linear OAuth.

The disagreement map is the most exciting feature and it is **correctly cut from Phase 1**. It needs voting volume across roles to say anything, and voting volume is precisely what Phase 1 exists to prove. Building it first would produce a beautiful visualization of eleven data points.

**Ship to 2–3 design partners in week 6.** Run for 4 weeks before building anything else.

---

## Phase 2 — Make it decision-grade (6–8 weeks)

Gated on Phase 1 engagement holding up. In rough priority order:

1. **Disagreement map** — per-role ratings, split index, auto-generated "contested items" meeting agenda. The feature that makes a PM pay.
2. **Jira** — 3LO, sync, JQL ladders, rank write-back. Market expansion; the biggest single engineering chunk.
3. **Order write-back with preview + Undo** — chunked, resumable, snapshotted, drift-aware.
4. **Effort ladders** — engineers-only, pairwise sizing, derived Value ÷ Effort.
5. **Overrides** — PM re-placement with recorded reason, shown beside the model's answer.
6. **Seasons + recap.**
7. **Weekly email digest** — reaches voters who ignore Slack apps, and execs.

---

## Phase 3 — Make it defensible (ongoing)

- **Outcome feedback loop** — did highly-ranked shipped items deliver? This is what turns calibration scoring from a popularity contest into something real, and it's the long-term moat: nobody else has the paired ranking-and-outcome data.
- Per-voter noise estimation (EM) — automatic, non-political down-weighting of unreliable voters.
- Public API + webhooks.
- Forge app for Atlassian Marketplace distribution.
- Customer-facing ladders (a different abuse model; treat as a separate product decision).
- SOC 2, SSO/SCIM — required to sell above ~300 people.

---

## Success metrics

**Phase 1 (the only ones that matter):**

| Metric | Target | Why |
|---|---|---|
| Weekly active voters / invited | **> 50%** at week 4 | Below this it's a single-player tool and the ranking is one person's opinion with extra steps |
| Sessions per voter per week | **> 3** | The habit exists or it doesn't |
| Median time per duel | **4–8s** | Faster = tapping blind; slower = cards lack context |
| Session completion rate | **> 80%** | Validates the 5-duel cap |
| Time to first settled ladder | **< 14 days** | The [02 §1](02-ranking-model.md) feasibility argument, tested |
| Audit-set accuracy | **> 75%** | The ladder measures something coherent |
| **Decision changed** | **≥ 1 per partner** | The real one — see below |

**The qualitative metric that outranks all of them:** in the week-4 interview, can the PM name a specific decision they made differently because of the ladder? If every partner says "it confirmed what I already thought," the product is a very well-engineered toy, and we should say so.

**Counter-metrics** (watch for the product going wrong):
- `need_context` rate rising → cards are too thin, or ticket hygiene is worse than we assumed
- time-per-duel falling below 2s → gamification is producing noise; pull a mechanic
- votes concentrated in 1–2 people → not multiplayer, ranking is capturable
- cycle ratio rising → ladders are incoherent, push splitting harder

---

## Scope cuts, in the order I'd take them

If Phase 1 runs long, cut in this sequence:

1. Web ladder view → **read-only, ugly**. Slack is the product in Phase 1.
2. Challenge flow → **defer**. Intake + daily duels prove the thesis alone.
3. Streaks and upsets → **defer**. The progress bar is the mechanic that matters.
4. Tiers → **defer**. Costs ~2 extra taps per insertion; not fatal at N ≤ 60.
5. Bootstrap CIs → **ship point estimates**, keep settled % (needs a cheap σ; use the analytic Fisher-information approximation as a stopgap).

**Never cut:** the simulation harness (week 1), the audit set (12% random duels), append-only comparisons, the "no rank shown on the duel card" rule. Each of those is load-bearing for correctness or credibility, and each is far more expensive to retrofit than to build.

---

## What not to build, ever

- **An LLM that prioritizes for you.** The pitch is *human judgment, efficiently elicited*. A model guessing at priority is the thing being replaced. LLMs summarize duel cards and cluster duplicate requests; they don't vote.
- **A ticket tracker.** We mirror. The moment we store work state we're competing with Jira on Jira's turf.
- **Our own auth/SSO.** Buy it.
- **A public voting portal (v1).** Different abuse model, different buyer, different product.
- **Deep RICE-style decomposition.** Separate Reach/Impact/Confidence ladders multiply duels 3–4× and reimport exactly the ambiguity we exist to remove.
