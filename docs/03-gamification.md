# 03 — Gamification

## The test every mechanic must pass

> **Does this increase information per tap, or does it just increase taps?**

Most gamification is a volume play. That's actively harmful here: a list built from 2,000 careless taps is *worse* than one built from 200 careful ones, because careless taps are indistinguishable from real signal in the database and the model will confidently fit noise.

## What single-player changes

Mostly it makes this much easier, and one whole chapter disappears.

**Gone: the entire integrity problem.** No vote weights, no conflict-of-interest flags, no ballot-stuffing detection, no Sybil resistance, no "whose opinion counts." **You cannot cheat a game you are playing against yourself.** The only person harmed by careless tapping is the person doing it, which turns adversarial defenses into gentle self-feedback.

**Gone: competitive and social mechanics.** No leaderboards, no consensus-calibration score, no "you agree with Devon 84% of the time." All of it was either risky or impossible.

**What's left is the well-understood single-player kit** — progress, completion, streaks, collection — which is the kit that actually works. And one mechanic that isn't gamification at all but does more than all of them combined.

---

## The mechanics

### 1. The first-session payoff (the strongest thing in the product)

> **Your stored order and your judgment disagree on 34 of 61 items.**

Not a game mechanic — a *result*. Fifteen minutes of tapping produced something Priya visibly did not have before, measured against her own previous behavior. It's specific, it's hers, it can't be faked, and it arrives at exactly the moment she's deciding whether this was worth the time.

Everything else on this page is retention. This is activation, and it matters more.

### 2. Progress toward a real finish line

The ~180-duel onboarding session needs a bar, and the bar must be driven by **confidence** (§[02 §6](02-ranking-model.md)), not by raw duel count.

This is honest and it's also better UX: it accelerates. Early duels resolve huge uncertainty and the bar leaps; later ones fine-tune. The session *feels* like it's speeding up as it goes, which is exactly backwards from how a counter feels and exactly right for finishing.

A hard, visible finish line is what makes a ~180-duel sitting completable. "84 of ~180" plus a bar at 68%.

### 3. Decay as an invitation

`"Your list is 84% confident. 6 duels to get back to 90%."`

The confidence number drifting down over weeks is a *reason to return* that requires no notification, no streak guilt, and no manufactured urgency. It's also true: the list really has gotten less reliable, because the backlog moved.

This is the closest thing to a retention loop that doesn't involve nagging, and it's a free consequence of the model rather than a bolted-on mechanic. If only one mechanic survives scope cuts, it's this one.

### 4. Zero-inbox on Unplaced

`Unplaced (12)` with a badge, and the satisfaction of driving it to zero. Inbox-zero is a proven single-player compulsion and it maps perfectly onto triage. `Never` as a one-tap archive is what makes clearing it feel good rather than obligatory.

### 5. Streaks 🔥 — yes, but quietly

A maintenance session on consecutive days. Worth having, with tight guardrails:
- **Freezes** (two a month, automatic). A streak lost to PTO is a user lost.
- **No streak-driven notifications.** One nudge a day maximum, ever.
- Never shown during the onboarding session — that's a focused sitting, not a habit moment.

Lowest-confidence mechanic on this page. Ship it last; cut it first.

### 6. Movers

`Audit log  #38 → #6` — the biggest changes since last session. Cheap, satisfying, and it does real work: it draws attention to items whose position changed a lot, which are exactly the ones worth a second look.

### 7. Self-consistency, shown gently

From the audit set ([02 §2.4](02-ranking-model.md)): *"You're 88% self-consistent."*

Interesting, honest, and the legitimate basis for every confidence number in the UI. But **frame it as a property of the data, not a grade on the user.** "88% self-consistent" is a fact about a noisy world; "you contradicted yourself 14 times" is an accusation. Nobody will tap 180 times for a tool that scolds them.

---

## What backfires

| Mechanic | Why it's out |
|---|---|
| **Duel-count goals or scores** | Rewards volume over care — the exact failure the top of this page exists to prevent |
| **Showing rank/score on the duel card** | Anchoring. See it's #3, pick #3, model re-learns its own output. The most damaging mistake available, and invisible once made |
| **Badges unrelated to judgment** | "Bronze Duelist — 50 votes!" tells a serious PO the whole tool is unserious. Priya is a professional doing her actual job |
| **Notification pressure** | One nudge a day, maximum, snoozable and disableable in one click, forever |
| **Artificial scarcity / daily duel limits** | She's ranking her own backlog. Rate-limiting her is absurd — the only cap is fatigue, which is self-enforcing |
| **Leaderboards of any kind** | There is one player |

---

## The one real integrity concern: fatigue

Anti-gaming is gone, but **careless tapping is still a data-quality problem** — it just has an entirely different remedy. Nobody is cheating; they're tired.

- **Watch response times.** Sub-800ms with no scroll on an unseen card is probably not judgment. Down-weight it in the fit; never accuse.
- **Watch accuracy decay through long sessions.** If the harness ([02 §7](02-ranking-model.md)) shows late-session taps measurably corrupting results, cap the session and say so kindly: *"Good stopping point — you've been at this 14 minutes."*
- **Make stopping safe.** Progress saved per tap, partial results already useful, resume anywhere. A session you can abandon guilt-free is one you'll start again tomorrow.

The failure mode of this product is not a cheater. It's a PO who tapped 180 times while distracted and got a list they can't trust — and who has no way to tell that's what happened. Everything above is aimed at that.
