# 03 — Gamification & Integrity

## The one test every mechanic must pass

> **Does this increase information per tap, or does it increase taps?**

Most gamification is a volume play: points, badges, leaderboards, streaks — engineered to make people do more of something. That is actively harmful here. A ranking built from 10,000 careless taps is *worse* than one built from 400 careful ones, because the careless taps look identical to real signal in the database and the model will confidently fit noise.

So every mechanic below is judged on whether it improves the quality of judgment, reduces the cost of giving it, or directs attention to where information is missing. Anything that just manufactures clicks gets cut, no matter how well it demos.

---

## What works

### Micro-sessions with a hard ending
Five duels. Thirty seconds. Then **"Done."**

The ending is the mechanic — not the points. A session that ends cleanly can be repeated tomorrow; an infinite feed trains people to quit mid-session, which is both a worse experience and a worse signal (late-session taps are measurably faster and less accurate; we'll track this).

### Streaks 🔥
Consecutive days with a completed session. Duolingo's most effective mechanic, and it fits a daily 30-second habit precisely.

Guardrails, because streaks are the most abusable thing here: **streak freezes** (two per month, automatic — a streak lost to PTO is a user lost), no streak-based scoring or leaderboard, and streaks never appear in the disagreement map or anywhere near the ranking output. A streak is a personal habit device. The moment it confers status in the prioritization process, people start tapping to protect it.

### The collective progress bar
**"Q3 Growth is 74% settled."**

This is the strongest mechanic in the product and it's not really a game mechanic at all — it's a shared goal with a legible finish line. Individual points are zero-sum and political; a bar that everyone moves together is cooperative. And because it's computed from actual decision-relevant uncertainty ([02 §6](02-ranking-model.md)), moving the bar *is* doing the real work. There's no way to game it that isn't just... contributing information.

It also decays. The bar slipping from 91% to 84% over three weeks is an honest, non-nagging reason to come back.

### Upsets 🚨
**"Upset — Usage-based billing (#11) just beat Audit log (#4)."**

Posted to the ladder's Slack channel when a low-ranked item beats a high-ranked one in a duel with meaningful weight. Cheap to build, genuinely fun, and it does real work: it pulls attention to exactly the pairs where the model is most uncertain, which is where more votes are most valuable.

### Attribution of consequence
**"Your vote broke the tie on FEAT-118."** · **"FEAT-902 crossed the cut line this week — you placed it."**

The single most motivating feedback is evidence that your tap mattered. We can compute this honestly: which comparisons had the largest effect on the fitted ranking (leave-one-out, or just the Elo delta). This is better than points because it's *true*.

### Requester feedback loop
**"Your request FEAT-902 moved #14 → #9 this week. 6 people have now ranked it."**

For Sam in Sales, this is the entire value proposition. Today his request disappears into a channel forever. Weekly movement notifications turn intake from a void into a process — and cost us nothing.

### Seasons and recaps
Quarterly. A recap page: what shipped vs. what was ranked, the biggest upsets, the most contested calls, how the seeded Jira order compared to where the team landed. Shareable, and the natural re-engagement moment. Spotify Wrapped for your backlog.

### Champion 👑
`#1` holds the crown; "17 days as champion" on the ladder header. Trivial to build, gives the top of the list a narrative, and makes displacing it feel like an event.

---

## What backfires

| Mechanic | Why it's out |
|---|---|
| **Vote-count leaderboard** | Directly rewards volume over care. The person who taps randomly 200 times wins and poisons the model. The single worst thing we could build. |
| **Points for filing requests** | Rewards backlog spam. We want *fewer, better* requests; intake friction is a feature ([01](01-product-spec.md), loop 1). |
| **Public per-person vote records** | Chills honesty. Devon will not vote "my team's infra work matters less than Sales' export feature" if his name is attached and visible. Aggregate by role publicly; keep individual votes admin-auditable only. |
| **Badges with no relation to judgment** | "Bronze Duelist — 50 votes!" is noise that trains people to see the whole tool as unserious. Devon in particular will write it off on sight, and Devon's judgment is the most valuable input we have. |
| **Showing rank/score on the duel card** | Anchoring. If I can see it's #3, I vote for #3 and the model just re-learns its own output. This is the most common and most damaging mistake in tools like this. |
| **Notification pressure to protect a streak** | The Duolingo-owl failure mode. One notification per day, maximum, ever. |

---

## Calibration score — powerful and dangerous

The tempting metric: *how often does your vote match the eventual consensus?* It's Beli's compatibility score, and it directly answers the question every product org quietly wants answered — **whose judgment should we trust?**

**The failure mode is severe.** A score that rewards agreement with the crowd rewards *conformity*. People learn to vote the way they think the group will vote, and the tool's entire value — surfacing independent judgment — evaporates. Worse, the person most worth listening to (the one who sees what others don't) scores lowest.

Mitigations, all of which we should apply:

1. **Score against outcomes where possible, not consensus.** Once items ship, did the highly-ranked ones deliver? This is slow (a quarter+ of lag) but it's the only version with real teeth. It's the long game and it's what makes the metric legitimate.
2. **Score against held-out comparisons, not the fitted model.** Can your votes predict *other people's* votes on pairs you haven't seen? That measures understanding of the group's real preferences, not echoing of a displayed number.
3. **Reward informativeness, not correctness.** Voting early on an uncertain pair contributes more than confirming a settled one. Credit the information contributed — which is unspoofable by conformity, since agreeing with an already-settled pair contributes ~nothing.
4. **Private by default, no public ranking of humans in v1.** Show me my own score and trend. Don't build a scoreboard of whose opinion counts; that's organizational dynamite with a very short fuse.

**Recommendation: ship #3 in Phase 1** (it's the safe one, and it powers the "your vote broke the tie" attribution above). Hold #1 and #2 for Phase 3, once there's enough shipped-outcome data to make them meaningful. Never ship a public human leaderboard.

---

## Integrity — the ranking influences what gets built, so people will try

This is not paranoia. The moment a ranking affects roadmaps, it becomes worth manipulating, and a tool that ignores that will produce a corrupted list that *looks* rigorous. Defenses in rough order of importance:

**Rate limits.** Per person, per ladder, per day (default 15 duels, 3 for a single item). Caps the blast radius of any individual acting in bad faith and, conveniently, is the same mechanism that prevents fatigue.

**Conflict-of-interest handling.** If you requested an item, your votes on it are *recorded, flagged, and down-weighted* (default 0.5×) — not blocked. Blocking is hostile and easy to route around by asking a colleague; flagging is transparent, preserves the signal, and is visible on the item detail view. The requester's opinion is legitimately informative; it just isn't disinterested.

**Speed traps.** Sub-800ms responses with no scroll on a card the voter hasn't seen before are almost certainly not judgments. Down-weight them (don't ban — sometimes the answer really is obvious). Track the per-voter distribution; a bimodal one is a strong tell.

**Stuffing detection.** Flag voters whose duels disproportionately involve a single item or label relative to what the selection policy would produce. Since we control pair selection, the expected distribution is known exactly — deviation is easy to compute and hard to fake.

**Per-voter noise estimation (Phase 3).** Extend the model with a per-voter temperature `τ_v`: `P(v picks i) = σ((θᵢ − θⱼ)/τ_v)`. Fit by EM alongside the item strengths. Voters whose responses are inconsistent with everyone else's get automatically down-weighted, with no human making an awkward judgment call about whose opinion counts. Elegant, self-correcting, and worth the complexity later.

**Transparency over secrecy.** Weights are visible. The audit log is visible to admins. Overrides are visible with their stated reason. Every number on the ladder can be drilled into: *why is this #3?* → the comparisons that put it there. A ranking nobody can interrogate is a ranking nobody will accept — and "show me why" is the single most common question a skeptical engineer will ask in the first week.

**Sybil resistance** comes free from SSO identity via Jira/Linear/Slack. Invited non-tracker stakeholders (Sales, Support — see [04](04-integrations.md)) are the soft spot: cap invites, require admin approval, and default their weight below 1.0 until they build a history.

---

## Notification budget

Hard limits, enforced in code, no per-org config to raise them:

- **1 proactive DM per person per day**, in their local morning.
- Upsets and challenge resolutions go to a **channel**, never a DM.
- Requesters get **1 weekly** movement digest.
- Everything snoozable and disableable from inside the message itself, in one click, forever.

The failure mode for this entire product category is being experienced as nagging. A prioritization tool that people mute is worth less than no tool at all, because the resulting ranking is built on the subset of people who tolerate notifications — which is not a representative sample of judgment.
