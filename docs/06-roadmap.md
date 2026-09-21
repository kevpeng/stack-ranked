# 06 — Roadmap

Single-player shortens this considerably. Phase 1 drops Slack, identity mapping, vote weights, consensus, and the batch scoring system — roughly two weeks of work removed, and the riskiest coordination problem removed with it.

## Phase 0 — Validate (1 week, no code)

The validation questions changed completely. The multiplayer version needed to prove *stakeholders disagree*. This one needs to prove **one person's judgment differs from what their tracker already says, and that extracting it is pleasant.**

**Run one backlog by hand.** Take a real PO's real backlog (60ish items). Export it. Run ~200 duels with them in a spreadsheet or a throwaway script over a single sitting — deliberately past the ~180 target, to find where the fatigue cliff is. Fit Bradley–Terry. Then show them the diff against their stored order.

This is a day of work and it tests almost everything at once:
- **Will they sit for ~180 duels?** Watch where they flag, get bored, or ask to stop. The answer determines whether the onboarding session is viable at all.
- **Is a duel answerable in ~5 seconds from a card?** The riskiest UX assumption. Listen for "I'd need to know more" — if that's frequent, the whole design changes.
- **Does the result differ from their Jira order?** If the settled list matches what was already stored, the product has no reason to exist. **This is the make-or-break number.**
- **Do they trust the output?** Watch their face at the diff. "Huh, that's actually right" vs. "no, that's wrong, Audit log isn't #6."

**Then three more, lighter.** Just the diff test — seed, ~180 duels, show the divergence. Enough to know whether the first result was a fluke.

**Exit criteria:** ≥3 of 4 POs complete a ~180-duel session without being pushed, median duel time under 8s, and seed-vs-settled divergence above ~25% of items with the PO endorsing the new order over the old one.

---

## Phase 1 — MVP (4 weeks)

**Thesis under test: will a PO sit for the session, and is the resulting list better than their tracker's?**

Linear only, web only.

| Week | Deliverable |
|---|---|
| 1 | **Simulation harness + scoring engine.** BT/MM, prior, bootstrap, decay, confidence metric, pair selection. Validated offline, no UI. |
| 2 | Linear OAuth + sync (webhook + reconciler). Spike checklist from [04](04-integrations.md) cleared. |
| 3 | **The duel session.** Keyboard-first, resumable, progress bar, tiers, placement + cutline + audit selection. The thing everything else exists to serve. |
| 4 | List view, cut line, unplaced queue, seed-vs-settled diff, Stack Score write-back, onboarding. Dogfood on our own backlog. |

**In scope:** one list per user, seeded cold start, ~180-duel onboarding session, placement duels, maintenance duels, decay + confidence, bootstrap CIs, cut line, unplaced queue with one-tap `Never`, the diff, score write-back.

**Explicitly out:** Jira, Slack, multiplayer anything, effort ladders, order write-back (score field only), pins, streaks, email, API, mobile.

Note what moved *out* of Phase 1 versus the multiplayer plan: Slack was the primary client and is now Phase 2, which is most of a week back. Note what moved *in*: the onboarding session got promoted from a feature to the centerpiece and gets a full week.

**Ship to 3–4 POs in week 4.** Run 3 weeks before building anything else.

---

## Phase 2 — Make it stick (4–6 weeks)

Gated on Phase 1 retention. Rough priority:

1. **Order write-back** with preview, Undo, drift detection, and opt-in auto-apply. The thing that makes the ranking real rather than a parallel universe.
2. **Slack** — daily nudge, inline maintenance duels, `/rank request` intake. The first genuinely multiplayer surface: anyone files, only the PO ranks.
3. **Jira** — 3LO, sync, JQL lists, rank write-back. The market expansion, and the biggest single chunk.
4. **Multiple lists** per user, with cross-list handling.
5. **Pins** — declare a position the model can't know about.
6. **Effort lists** — pairwise sizing, derived Value ÷ Effort. Strong feature; needs the core loop proven first.
7. Streaks, movers, self-consistency display.

---

## Phase 3 — Beyond one player

- **[08](08-multiplayer-later.md)** — invite stakeholders, consensus, disagreement map. The natural expansion and the reason `voter_id` is already in the schema. Only after single-player retention is proven; doing it earlier reintroduces every problem this scope cut removed.
- Outcome feedback — did highly-ranked shipped items deliver?
- Public API, Forge marketplace app, SOC 2 / SSO.

---

## Success metrics

**Phase 1 — the only ones that matter:**

| Metric | Target | Why |
|---|---|---|
| **Onboarding completion** | **> 60%** finish a full session | The centerpiece works or it doesn't |
| Median duel time | **4–8s** | Faster = tapping blind; slower = cards too thin |
| Abandonment position | **no cliff before ~150** | A cliff at 70 means the session must be shorter |
| **Seed-vs-settled divergence** | **> 25% of items move** | Below this the tracker order was already fine |
| Audit-set accuracy | **> 80%** | One voter should be self-consistent; lower means incoherent list or thin cards |
| Return within 14 days | **> 50%** | Decay-driven maintenance works or it's a one-shot utility |
| Unplaced queue cleared | **> 70%** within a week of arrival | Triage-as-taps actually beats triage-as-chore |

**The qualitative metric that outranks all of them:** at the week-3 interview, does the PO say the new order is *better* than what they had — and can they name an item whose position genuinely surprised them? If everyone says "it basically matched my gut," this is a well-engineered toy.

**Counter-metrics:**
- time-per-duel falling below 2s → tapping blind; shorten the session
- accuracy decaying through sessions → fatigue; cap it
- `skip` rate rising → cards too thin, or the list is incoherent
- nobody returns after onboarding → decay isn't creating a reason to come back; the product is a utility, not a habit

---

## Scope cuts, in order

1. Tiers → **defer.** Costs ~2 extra taps per placement; not fatal at N ≤ 150.
2. Bootstrap CIs → ship point estimates, keep a cheap σ for confidence.
3. Maintenance duels → **defer.** Onboarding + placement alone tests the core thesis.
4. Unplaced queue → **defer.** Onboarding alone is the Phase 1 story.
5. Cut line → **defer** as a UI element, but **keep the cut-line-focused pair selection** — that's what makes the budget work.

**Never cut:** the simulation harness (week 1), the audit set, append-only comparisons, `voter_id` in the schema, keeping `seed_order` forever, and the "no rank shown on the duel card" rule. Each is load-bearing for correctness or credibility, and each is far more expensive to retrofit than to build.

---

## What not to build, ever

- **An LLM that prioritizes for you.** The pitch is *your judgment, efficiently elicited*. A model guessing at priority is the thing being replaced. LLMs summarize cards and spot duplicates; they don't rank.
- **A ticket tracker.** We mirror. Storing work state means competing with Jira on Jira's turf.
- **Our own auth/SSO.** The tracker OAuth is the login.
- **Deep RICE-style decomposition.** Separate Reach/Impact/Confidence lists multiply duels 3–4× and reimport exactly the ambiguity we exist to remove.
