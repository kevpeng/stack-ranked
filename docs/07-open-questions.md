# 07 — Open Questions, Risks, and Kill Criteria

## Resolved by going single-player

Worth recording, because several of these were genuinely hard and are now simply gone: vote weights and their visibility, conflict-of-interest handling, ballot-stuffing and Sybil defenses, whose-opinion-counts politics, consensus reconciliation, the "PM doesn't want a democracy" adoption risk, identity mapping for stakeholders without tracker seats, and the online/batch scoring split.

That's most of the hard problems in the original design, removed by one scope decision.

---

## Decisions needed from you

Recommendations attached — these are confirmations, not open debates. Push back where you disagree; several are close.

### Product

**1. How big is the onboarding session, really?**
→ **Target ~3× item count — roughly 2× the information-theoretic floor (61 items → ~180 duels, ~15 min) — resumable throughout.** But this is the assumption the whole product rests on and I'd rather measure it than argue it. Phase 0's hand-run session answers it directly. If POs flag at 80 duels, the fallback is a "top 20 only" session (~60 duels, 5 min) that ranks the part that matters and leaves the tail seeded.

**2. Web-first or Slack-first?**
→ **Web-first, decisively.** This inverts the multiplayer plan. A focused 15-minute keyboard-driven session cannot happen in a chat card, and the PO already lives in their tracker. Slack becomes the Phase 2 maintenance nudge.

**3. One list or many per user?**
→ **One in Phase 1.** Multiple lists raise cross-list questions (does an item appear in two? do they share a cut line?) that aren't worth answering before the core loop is proven.

**4. Does the PO ever see other people's opinions?**
→ **No, not even as a display.** Once stakeholder input is visible it becomes a number to defend, and we're back to the multiplayer product with none of its machinery. Others file into Unplaced; that's the whole interface.

**5. Auto-apply order to the tracker?**
→ **Offer it, don't default it.** The single-owner scope makes auto-apply defensible in a way it never was for a shared backlog — but the first surprise overwrite loses the user, so earn it.

**6. `Never` — archive in the tracker, or just hide locally?**
→ **Hide locally in Phase 1, offer tracker archive as a setting.** Deleting someone's tickets on day one is a great way to never be trusted again.

### Model

**7. Does Bradley–Terry survive single-player, or is a plain ordered array enough?**
→ **BT survives**, and [02 §3.0](02-ranking-model.md) argues it properly. Short version: an array has nowhere to put self-inconsistency, no notion of confidence (so staleness is invisible), and no way to know that a March placement has aged. Those three are the maintenance loop, which is the whole reason this isn't a one-shot utility. *Genuinely the closest call in the document* — if Phase 0 shows POs never contradict themselves and never return after onboarding, the array version is simpler and I'd take it.

**8. Decay half-life?**
→ **90 days to start, measured in the harness.** Longer than the multiplayer default because one person's preferences are stable and there's no roster turnover. It's the parameter the maintenance loop lives or dies by; expose it in settings.

**9. Is 10% audit overhead worth it?**
→ **Yes.** It's the only honest measure of self-consistency, and self-consistency is the basis for every confidence number shown in the UI.

**10. Is "which ships first" really one question?**
→ Unresolved, and the honest answer is *sometimes not* — which is why [02 §6](02-ranking-model.md) measures intransitivity and recommends splitting a list when cycles spike. Effort lists (Phase 2) are the other half of the answer.

### Business

**11. Pricing.** Single-player is a per-seat personal tool — clean, but it caps revenue at one seat per backlog and there's no expansion path until [08](08-multiplayer-later.md). Probably $20–40/mo individual. Worth deciding whether that's the business or just the wedge.
**12. Is this a company or a personal tool?** Genuinely open, and it now matters more: single-player has no network effect and no lock-in. If it's a tool you want to exist, build Phase 1 and stop worrying. If it's a company, [08](08-multiplayer-later.md) is the business and Phase 1 is customer acquisition.

---

## Top risks

### 1. "Why not just drag things in Jira?" · *certain, existential*
Every user asks this in the first thirty seconds, and there's no network effect to fall back on. The answer — *dragging requires holding the list in your head; comparing two items doesn't* — has to be **demonstrated, not argued**, which is exactly what the seed-vs-settled diff does. If that diff comes back small, we have no answer at all. Watch it above all else.

### 2. It's a one-shot utility · *likely, high impact*
The realistic failure: a PO runs the session once, loves the result, applies it, and never returns. Ranking a backlog is not intrinsically a daily need.
**Mitigations:** decay-driven confidence, the Unplaced queue as an ongoing reason to open the app, maintenance nudges.
**Honest assessment:** this is the biggest business risk in the single-player scope, and it's *created* by the scope cut — multiplayer had a built-in reason to return (other people voting). **Detection:** return-within-14-days is the canary. If it's low but satisfaction is high, the product may be a one-time service (or a cheaper one-off purchase) rather than a subscription, which is a real finding, not a failure.

### 3. Tickets are too thin to judge · *likely, high impact*
Backlogs are full of items titled "Fix the thing (see thread)." A duel that can't be answered stalls the session.
**Mitigations:** generated summary lines on sync, evidence chips, `Edit ticket` inline on the card, blocking un-duelable items until a line exists.
This is the #1 thing Phase 0's hand-run session tests, and the sharpest version of the risk is that it bites *hardest during onboarding* — the moment we can least afford friction.

### 4. Session fatigue corrupts the data · *moderate*
~180 duels is a lot. If accuracy decays badly after ~100, the back half of the session is noise that looks like signal.
**Mitigation:** measure it in the harness *before* building the UI; cap the session if real. Down-weight fast, no-scroll responses.

### 5. The seed is garbage · *moderate*
The cold start and the entire first-session payoff assume `sortOrder`/`priority` encode *something*. If real backlogs are effectively random below the top 20, the diff is 90% and meaningless rather than 30% and insightful.
**Mitigation:** it's on the [04](04-integrations.md) spike checklist. If the seed is noise, present the diff as "your backlog was unordered below #20" — still a real finding, but a weaker demo.

### 6. Integration maintenance · *certain, chronic*
Two tracker APIs, permanently evolving. The tax on the business. Narrow write surface, reconciler as backstop, recorded fixtures in CI, and resist every request to sync more fields.

### 7. Multiplayer demand arrives early · *moderate, good problem*
The first question after "why not drag" will be "can my team vote too?" Saying no repeatedly is a real cost.
**Mitigation:** `voter_id` is already in the schema ([05](05-architecture.md)), so [08](08-multiplayer-later.md) is additive. Say "not yet" honestly rather than bolting it on and inheriting every problem this scope cut just removed.

---

## Kill criteria

Decided now, while it's cheap to be honest:

- **After Phase 0:** fewer than 3 of 4 POs complete a ~180-duel session voluntarily, and a shortened session doesn't fix it → the atomic unit doesn't work; stop or redesign.
- **After Phase 0:** seed-vs-settled divergence consistently under ~15%, or POs look at the diff and prefer their original order → the tracker order was already fine; stop.
- **Week 3 of pilot:** onboarding completion under 40% → the centerpiece doesn't hold.
- **Week 3 of pilot:** nobody returns after their first session → it's a one-time utility. Not necessarily fatal, but it's a different product with different pricing, and we should say so out loud rather than build a subscription around a one-shot.
- **Any point:** audit-set accuracy near chance on multiple lists → we're rendering confident-looking noise. Fix the model or stop. **Do not ship a ranking we can't defend.**

---

## What I'd test first, in one sentence

Take one PO's real backlog, sit with them for ~200 hand-run duels in an afternoon, fit the model in a spreadsheet, and show them the diff against their stored order — because that single session tests the fatigue risk, the thin-ticket risk, the seed-quality risk, and the "why not just drag it" risk simultaneously, and costs a day.
