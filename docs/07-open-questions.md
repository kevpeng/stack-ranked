# 07 — Open Questions, Risks, and Kill Criteria

## Decisions needed from you

Each has a recommendation attached, so these are confirmations rather than open-ended debates. Push back where you disagree — several of these are genuinely close calls.

### Product

**1. Linear first or Jira first?**
→ **Linear.** Cleaner API, `sortOrder` is a float instead of LexoRank, far less enterprise config surface, and the early-adopter population skews Linear. Jira is the bigger market and should be Phase 2 — but making Jira the first integration adds ~3 weeks before a single user votes.
*Counter-argument worth hearing:* if your design partners are all on Jira, this inverts. Partner availability beats API ergonomics.

**2. Is Slack the primary surface, or the web app?**
→ **Slack for voting, web for deciding.** The whole thesis depends on non-PM stakeholders participating daily, and they will not open a sixth tab. If it turns out Slack is unavailable at the target orgs (Teams shops), that's a real problem worth knowing in Phase 0.

**3. Personal ladders — separate feature or derived view?**
→ **Derived view.** Refit on one voter's comparisons with shrinkage toward consensus ([02 §8](02-ranking-model.md)). A standalone personal ladder would require every person to do `log N` work per item, which multiplies the effort by the roster size for little gain.

**4. One axis or value + effort?**
→ **Ship First only in Phase 1.** It bundles value and cost, which is the actual decision. Effort ladders in Phase 2 — they're a strong feature (pairwise sizing genuinely beats story points, and it's the thing most likely to win over skeptical engineers), but they double the duels before we've proven anyone will do the first set.

**5. Who can vote?**
→ **Invited per ladder, with roles.** Not "everyone in the org." A ladder needs the ~5–20 people with real stakes; opening it to everyone dilutes signal and creates a capture surface. Critically, support **voters with no tracker seat** — Sales and Support are among the most valuable and least likely to have a Jira license.

**6. Does the requester's vote on their own item count?**
→ **Yes, flagged and down-weighted 0.5×.** Blocking it is hostile and trivially routed around by asking a colleague; flagging is transparent and keeps genuinely informative signal.

**7. Are vote weights visible?**
→ **Yes, always.** A hidden weighting scheme discovered later is a trust catastrophe. A visible one is just a policy people can argue with — and arguing about it is healthy.

### Model

**8. How aggressively do we bias pair selection toward the cut line?**
→ Start moderate; **tune with the simulation harness** ([05](05-architecture.md)), not with real users. Too aggressive and the model learns nothing about the rest of the ladder, which makes the cut line itself unstable when capacity changes.

**9. Is 12% audit-set overhead acceptable?**
→ **Yes, and don't go below 10%.** It's the only honest measure of whether the model works. The alternative is a confident-looking ranking with no way to know it's wrong.

**10. Does the settled % get shown before a ladder has meaningful data?**
→ **No.** Below ~2 comparisons per item, show "Seeded" and hide the cut line. A confident-looking list built from priors on day one is the fastest way to lose a design partner.

### Business (later, but they shape the build)

**11. Pricing shape** — per-seat is the SaaS default, but the voters are the cheap-seat majority and per-seat pricing directly discourages inviting them, which breaks the product. → Lean **per-ladder or per-workspace tier**. Revisit with partners.
**12. Open source?** The scoring engine is the interesting-but-commodity part; the integrations and the loop are the work. Open-sourcing the engine could be good distribution. No urgency.
**13. Does this need to be a company, or is it an internal tool?** Genuinely unclear and worth deciding before Phase 1, because it changes how much of [04](04-integrations.md)'s security work is required.

---

## Top risks

### 1. Fatigue — people stop voting by week 3 · *likely, high impact*
The default outcome for every prioritization tool ever built. **Mitigations:** 5-duel hard cap, Slack-native, 30-second sessions, one notification per day, streaks with freezes, collective progress bar, decay-driven re-engagement. **Detection:** sessions/voter/week is the canary — watch it from day one of the pilot.

### 2. Tickets are too thin to judge · *likely, high impact*
Real backlogs are full of items titled "Fix the thing (see thread)." If a duel card can't be answered, the loop stalls.
**Mitigations:** generated summary lines on sync, evidence chips, the `need_context` button as a first-class action that pings the owner, and blocking un-duelable items from ladders until someone writes a line.
**Reframe:** this is also a feature. "This ticket can't be ranked because nobody can tell what it is" is a message PMs *want* to be able to send. But be honest that it's friction at exactly the wrong moment. **This is the #1 thing the Phase 0 paper prototype exists to test.**

### 3. The PM doesn't want a democracy · *moderate, fatal if mishandled*
A PM who feels the tool is taking their authority will not adopt it, and they're right to resist. Everything in [00](00-vision.md)'s positioning exists to address this: advisory output, first-class overrides with recorded reasons, explicit Apply rather than automatic write-back, disagreement surfaced as an *agenda* rather than a verdict. **Watch for:** the word "voting" landing badly in partner conversations. If it does, the copy should lean on "input" and "signal" over "vote" and "election."

### 4. Backlog churn outruns convergence · *moderate*
If 30 items change weekly, a ladder may never settle. **Mitigations:** scoped ladders (20–150 items, not 2,000), tiers, seasons, time decay, and cut-line focus. **Detection:** if `items_changed_per_week / ladder_size` > ~0.25, warn the user their ladder scope is too broad.

### 5. Political capture · *moderate, corrosive*
A VP tells their team to vote a certain way; a director challenge-spams. Rankings that influence roadmaps are worth manipulating. See [03](03-gamification.md) for defenses. The honest note: **no technical mitigation survives a determined executive.** What we can do is make manipulation *visible* — the audit log and the disagreement map make a coordinated bloc obvious in the data, which is often enough.

### 6. Integration maintenance burden · *certain, chronic*
Two tracker APIs plus Slack, all evolving. This is the permanent tax on the business. **Mitigations:** narrow write surface (one field + explicit Apply), reconciler as a backstop for all webhook paths, recorded fixtures in CI, and resisting every request to sync more fields.

### 7. "It just confirms what I already knew" · *moderate, existential*
If the settled ranking always matches the PM's prior, the product has no value, however elegant. **This is what Phase 0's hand-run ladder is for** — run it manually on one partner's real backlog and look at the result before writing meaningful code. If the order matches their gut every time, pivot toward the *disagreement map* as the core product (which has value even when consensus matches the PM's prior, because the split is still news) or stop.

---

## Kill criteria

Decided now, while it's cheap to be honest:

- **After Phase 0:** fewer than 3 of 5 partners show real internal disagreement on their own top 15 → the problem isn't felt; stop.
- **After Phase 0:** the paper duel test comes in below ~50% answered-without-hesitation, and adding context to the card doesn't fix it → the atomic unit doesn't work; stop or redesign from scratch.
- **Week 4 of pilot:** weekly active voters below 30% of invited across all partners → the habit doesn't form; stop.
- **Week 4 of pilot:** no partner can name a decision that changed → it's a toy; pivot to the disagreement map or stop.
- **Any point:** audit-set accuracy near chance on multiple ladders → we're rendering confident-looking noise. Fix the model or stop. **Do not ship a ranking we can't defend.**

---

## What I'd most want to test first, in one sentence

Take one design partner's real backlog, hand-run 200 duels in Slack over a week, fit the model in a spreadsheet, and show them the ranking plus the disagreement map — because that single week tests the thesis, the duel card, the fatigue risk, and the "it just confirms what I knew" risk simultaneously, and costs nothing but time.
