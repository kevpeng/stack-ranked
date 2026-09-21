# 04 — Integrations

> **Confidence note.** API shapes below are accurate enough to plan against, but anything marked **[SPIKE]** must be verified against current docs before it's committed to a schedule. Integration work is where estimates die; the checklist at the end front-loads that risk into week one.

## What single-player simplifies

Three things get materially easier, and one gets a promotion:

**Identity mapping mostly disappears.** The multiplayer design needed to handle Sales and Support stakeholders who vote but have no Jira seat — invite flows, email matching, weighted guest accounts. Single-player: the PO is definitionally the person who owns the backlog, so they definitionally have a tracker seat. One OAuth, one identity. An entire subsystem deleted.

**Slack gets demoted from primary client to optional nudge.** This is the biggest change. Multiplayer *had* to live in Slack — you can't ask ten stakeholders to open a sixth tab. But the PO already opens Jira or Linear all day; a focused 15-minute ranking session belongs in a real UI with keyboard shortcuts, not in a chat card. **Slack moves to Phase 2** as a daily maintenance nudge, and Phase 1 gets meaningfully smaller.

**Write-back gets more aggressive.** The "don't reorder someone else's backlog" objection dissolves when there's exactly one owner. Auto-apply becomes a reasonable *option* (still not the default — see below).

---

## Sync philosophy: mirror in, write narrow

```
  TRACKER ──────────── read: continuous, everything ──────────▶ STACK RANKED
     ▲                                                              │
     └──── write: score field always; order on Apply ───────────────┘
```

**Read-heavy:** mirror tickets continuously (webhook + periodic reconcile). The tracker remains the system of record for the *ticket*; we own only the *order*.

**Write-narrow:** two paths.
1. **Stack Score → one custom field.** Continuous, idempotent, safe.
2. **Backlog order.** Default: explicit, previewed, reversible **Apply**. Because there's a single owner, also offer **auto-apply** as an opt-in setting — some POs will want the tracker to just always reflect the ranked order, and with nobody else's drag-and-drop to stomp on, that's a legitimate choice. Never the default; always reversible.

**Drift handling:** snapshot the exact order at Apply. If the tracker has changed since, show a diff rather than silently overwriting:

> Since your last Apply, 4 items were reordered in Linear. [View diff] [Apply anyway] [Re-seed from Linear]

---

## Linear (build first)

Better API, no LexoRank, far less config surface, and the early-adopter population skews Linear.

**Auth:** OAuth2, `read` + `write`. **[SPIKE]** exact scopes for issue update and for reading team/project/label metadata.

**API:** GraphQL. One query covers the mirror:

```graphql
issues(filter: $filter, first: 100, after: $cursor) {
  nodes {
    id  identifier  title  description  priority  estimate  sortOrder
    createdAt  updatedAt
    state { name type }  team { id key }  project { id name }
    labels { nodes { name } }  creator { id email }
  }
  pageInfo { hasNextPage endCursor }
}
```

**Field mapping:**

| Linear | Stack Ranked | Notes |
|---|---|---|
| `id` | `items.external_id` | Stable; `identifier` (ENG-123) is display only |
| `priority` (0–4) | cold-start seed | 0 = none, 1 = urgent … 4 = low. Note the inversion |
| `estimate` | duel-card chip | Only if the team enabled estimates |
| `sortOrder` (float) | cold-start seed, Apply target | Fractional — insert between neighbors by averaging |
| `labels`, `project`, `team` | list filters, comparability | |
| `state.type` | lifecycle | `completed`/`canceled` → freeze item, keep its comparisons |

**Write-back:** `issueUpdate`. `sortOrder` being a float makes reordering trivial — assign values between neighbors. **[SPIKE]** custom-field support on the plan tiers our users are on; determines whether the Stack Score path is clean or needs a maintained comment.

**Webhooks:** Issue create/update/remove, HMAC-signed. Verify every delivery; reject unsigned. **[SPIKE]** header name and signature scheme.

**Rate limits:** complexity-based. **[SPIKE]** current numbers. Design for it regardless: bulk filtered queries, respect `Retry-After`, never fan out per-item.

---

## Jira (Phase 2)

Bigger market, meaningfully more work. Don't let it block Phase 1.

**Auth:** OAuth 2.0 (3LO) for Jira Cloud. **[SPIKE]** 3LO vs. **Forge** — Forge gets marketplace distribution and Atlassian-hosted trust but constrains runtime and adds review cycles. Lean: 3LO for early users, Forge later for distribution. Server/Data Center explicitly out of scope.

**Ranking is the hard part.** Backlog order is LexoRank in a customfield whose ID varies per instance. Don't compute LexoRank strings by hand:

```
PUT /rest/agile/1.0/issue/rank
{ "issues": ["ENG-1","ENG-2"], "rankBeforeIssue": "ENG-7" }
```

A full reorder is therefore a *sequence of relative moves* — slow for large lists, not atomic, and a partial failure leaves a half-applied order. **Apply must be chunked, resumable, idempotent, and snapshot the prior order so Undo is real.** **[SPIKE]** batch limits and partial-failure behavior.

**Scoping:** a list maps to **JQL**, which fits perfectly — POs already have saved filters defining exactly the slice they care about. (Linear filters play the same role.)

**Webhooks:** **[SPIKE]** dynamic registration under 3LO has historically been limited. **Build the polling reconciler regardless** (`updated > cursor`, every 5 min) — it's the necessary backstop for missed webhooks on both providers anyway.

**Stack Score:** number custom field. **[SPIKE]** creatable via API, or does an admin do it manually? Affects onboarding friction a lot.

---

## Slack (Phase 2 — nudge only)

Not the client. Its whole job is the maintenance loop:

- **Daily nudge** — *"Your list is 84% confident. 6 duels to get back to 90%."* with a deep link into the web app, plus inline duel cards for people who want to tap in place.
- **Intake** — `/rank request` opens a form; the item lands in Unplaced. This is the one genuinely multiplayer surface, and it stays multiplayer: anyone can file, only the PO ranks.
- **Notify requesters** when their item is placed.

Block Kit is fine for 5 maintenance duels. It is *not* fine for a ~180-duel onboarding session — that needs keyboard shortcuts and a real layout ([01](01-product-spec.md)).

---

## Security & data handling

Ticket contents are customer-sensitive (deal names, ARR, incident details, occasionally PII).

- **Tokens:** envelope-encrypted at rest (KMS), never logged, never in error payloads. Refresh with backoff; a revoked token pauses the connection and notifies rather than retrying forever.
- **Scopes:** minimum viable. If read-only carries onboarding, request write scopes at the moment of first Apply — a far easier ask once the tool has proven useful.
- **Retention:** mirror only the mapped fields. No attachments, no comment bodies. Deleted upstream → soft-delete, **keep the comparisons** (they're ours and deleting them corrupts the model) but scrub title and description.
- **Tenancy:** every row carries `org_id`, enforced at the query layer via Postgres RLS, not by convention. Cheap now, painful to retrofit — and necessary anyway for [08](08-multiplayer-later.md).
- **Webhooks:** signature-verified on every delivery, no exceptions.
- **Egress:** no ticket content to third parties. If LLM summarization for duel cards ships ([01](01-product-spec.md)), it's opt-in, disclosed, with a documented provider and a no-training guarantee. Expect this question on the first call.

---

## Spike checklist (week 1, timeboxed to 2 days)

Smaller than the multiplayer version — no Slack, no identity mapping.

- [ ] Linear OAuth end-to-end: install, token refresh
- [ ] Linear rate limits: real numbers; cost of syncing a 300-item backlog
- [ ] Linear custom fields: available? which plans? writable via API?
- [ ] Linear webhook signature scheme
- [ ] `sortOrder` write-back: reorder 100 items, confirm no fractional-precision collisions
- [ ] Seed quality: does `priority` + `sortOrder` produce a *usable* starting order, or is real-world `sortOrder` effectively random below the top 20? **This one matters most** — the §5 cold-start seed and the first-session payoff both depend on it
