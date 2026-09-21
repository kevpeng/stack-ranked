# 04 — Integrations

> **Confidence note.** API shapes below are from working knowledge and are accurate enough to plan against, but specifics marked **[SPIKE]** must be verified against current docs before they're committed to in a schedule. Integration work is where estimates go to die; the spike checklist at the end exists to front-load that risk into week one.

---

## Sync philosophy: mirror in, write narrow

Bidirectional sync is a trap. Two systems that both believe they own ordering will fight, and the resulting loops are miserable to debug and worse to explain to a customer.

```
  TRACKER ──────────── read: continuous, everything ──────────▶ STACK RANKED
     ▲                                                              │
     └──── write: one field always, order only on explicit Apply ───┘
```

**Read-heavy:** mirror tickets continuously (webhook + periodic reconcile). The tracker is the system of record for the *ticket*.

**Write-narrow:** two write paths, deliberately asymmetric.
1. **Stack Score → a single custom field.** Continuous, idempotent, safe. Makes the ranking visible where people already work and is the main reason a PM keeps the integration on.
2. **Backlog order.** *Only* on an explicit, previewed, reversible **Apply**. Never automatic, never on a schedule. Reordering someone's sprint backlog without them asking is the single fastest way to get uninstalled.

**Drift handling:** record the exact order at Apply time. If the tracker's order has changed since, don't overwrite silently — show the diff:

> Since your last Apply, 4 items were reordered in Linear. [View diff] [Apply anyway] [Re-seed from Linear]

Never fight a human's drag-and-drop. Surface it, let them choose.

---

## Linear (build first)

Better API, far less enterprise configuration surface, and the design-partner population skews Linear. Ship this first.

**Auth:** OAuth2, `read` + `write` scopes, `actor=app` so writes are attributed to Stack Ranked rather than impersonating a user. **[SPIKE]** confirm scopes needed for issue update and for reading team/project/label metadata.

**API:** GraphQL. One query gets everything we need per issue:

```graphql
issues(filter: $filter, first: 100, after: $cursor) {
  nodes {
    id  identifier  title  description  priority  estimate  sortOrder
    createdAt  updatedAt
    state { name type }  team { id key }  project { id name }
    labels { nodes { name } }  creator { id email }  assignee { id email }
  }
  pageInfo { hasNextPage endCursor }
}
```

**Field mapping:**

| Linear | Stack Ranked | Notes |
|---|---|---|
| `id` | `items.external_id` | Stable; `identifier` (ENG-123) is display-only |
| `priority` (0–4) | cold-start prior | 0 = none, 1 = urgent … 4 = low. Note the inversion. |
| `estimate` | effort prior, duel card chip | Present only if the team enabled estimates |
| `sortOrder` (float) | cold-start prior, Apply target | Fractional ordering — insert between neighbors by averaging |
| `labels`, `project`, `team` | ladder filters, comparability | |
| `state.type` | lifecycle | `completed`/`canceled` → freeze the item, keep its history |

**Write-back:** `issueUpdate` mutation. `sortOrder` is a float, so reordering is just assigning values between neighbors — much easier than Jira's LexoRank. Stack Score goes into a custom field if available, otherwise a maintained comment or a structured line in the description. **[SPIKE]** verify current custom-field support on the plan tiers our design partners use; this determines whether write-back path #1 is clean or hacky.

**Webhooks:** subscribe to Issue create/update/remove. HMAC-signed with a per-integration secret — verify every delivery, reject unsigned. **[SPIKE]** confirm header name and signature scheme.

**Rate limits:** complexity-based, not request-count-based. **[SPIKE]** get current numbers. Design for it regardless: batch queries, respect `Retry-After`, never fan out per-item requests when a filtered bulk query works.

---

## Jira (Phase 2 — where the money is)

Bigger market, meaningfully more work. Don't let it block Phase 1.

**Auth:** OAuth 2.0 (3LO) for Jira Cloud. **[SPIKE]** decide 3LO vs. a **Forge** app. Forge gets marketplace distribution, in-product UI panels, and Atlassian-hosted trust — but constrains runtime and adds a review cycle. Rough lean: 3LO first for design partners, Forge later for distribution. Jira Server/Data Center is explicitly out of scope.

**APIs:** REST v3 for issues and fields; **Agile API** for ranking.

**Ranking is the hard part.** Jira's backlog order is LexoRank, stored in a customfield whose ID varies per instance (`customfield_10019`-ish). Don't compute LexoRank strings by hand — use the endpoint:

```
PUT /rest/agile/1.0/issue/rank
{ "issues": ["ENG-1","ENG-2"], "rankBeforeIssue": "ENG-7" }
```

Applying a full reorder is therefore a *sequence* of relative moves, not a bulk assignment. Implications: it's slow for large ladders, it's not atomic, and a partial failure leaves a half-applied order. **Apply must be chunked, resumable, idempotent, and snapshot the prior order first so Undo is real.** **[SPIKE]** batch-size limits and behavior under partial failure.

**Stack Score:** create a number custom field on install; write continuously. **[SPIKE]** field creation via API vs. requiring an admin to make it manually — affects onboarding friction a lot.

**Scoping:** a ladder maps to **JQL**, which is an excellent fit — PMs already have saved filters that define exactly the slice they care about. (Linear filters play the same role.)

**Webhooks:** **[SPIKE]** dynamic registration under 3LO has historically been limited. Build a **polling reconciler regardless** (`updated > last_cursor`, every 5 min) — it's needed as a backstop for missed webhooks in both providers anyway, so it's not wasted work.

---

## Slack (ship with Phase 1 — this is the main client)

Not an add-on. Most voting happens here; the web app is for deciding.

- **Duel card** — Block Kit with two primary buttons and an overflow for tie / need-context / skip. Ack within 3s, then `response_url` to swap in the next duel. Five cards per session, in-place.
- **`/stackrank`** — `request`, `duel`, `status`, `challenge ENG-123`.
- **Daily DM** — scheduled per-user in their local timezone, from Slack profile TZ.
- **Channel posts** — upsets, challenge resolutions, weekly ladder summary. Never DMs for these.
- **App Home** — your streak, your open challenges, your requests and where they sit.
- **Auth:** Slack OAuth; map identity by email to tracker accounts.

Block Kit's constraint — a handful of short text lines and a couple of buttons — is a **feature**. It forces the duel card to stay glanceable, which is exactly the discipline the format needs.

---

## Identity mapping (an underrated problem)

Sales and Support are among the most valuable voters and **frequently have no Jira or Linear seat.** If voting requires a tracker account, we lose half the signal that makes the product multiplayer.

```
person
  ├─ slack_user_id        ← primary for voting
  ├─ tracker_account_id   ← optional
  ├─ email                ← the join key
  └─ role                 ← drives weight + role aggregation in the disagreement map
```

Match by email, with manual reconciliation for mismatches (work vs. personal, aliases, SSO quirks). Support **invited voters** who exist only in Slack: weight below 1.0 until they build a history, admin-approved, capped per ladder.

Roles (`pm`, `eng`, `design`, `sales`, `support`, `exec`, `other`) are set by the admin. They drive vote weights *and* the per-role aggregation in the disagreement map — which is the output Priya cares most about, so getting roles right at onboarding matters more than it looks.

---

## Security & data handling

Ticket contents are customer-sensitive (deal names, ARR, incident details, occasionally PII in descriptions).

- **Token storage:** encrypted at rest with envelope encryption (KMS), never logged, never in error payloads. Automatic refresh with backoff; a revoked token pauses the connection and notifies the admin rather than retrying forever.
- **Scopes:** minimum viable. If read-only gets us through onboarding, request write scopes later, at the moment of first Apply — a much easier ask once the tool has proven useful.
- **Retention:** mirror only the fields in the mapping table. Don't store attachments or comment bodies. Deleted upstream → soft-delete locally, **keep the comparison history** (it's ours, it's aggregate, and deleting it would corrupt the model) but scrub title and description.
- **Tenancy:** every row carries `org_id`; enforce at the query layer, not by convention. Postgres RLS is worth the setup cost here.
- **Webhook verification:** signature-verified on every delivery, both providers, no exceptions.
- **Audit log:** every Apply, every override, every weight change, every role change — who, when, before, after.
- **Egress:** no ticket content to third parties. If LLM summarization for duel cards ships ([01](01-product-spec.md)), it must be opt-in per org, disclosed, with a no-training guarantee and a documented provider. Several design partners will ask about this in the first call; have the answer ready.

---

## Spike checklist (week 1 of Phase 1, timeboxed to 3 days)

Every item below is a schedule risk. Answer them before committing to dates.

- [ ] Linear OAuth end-to-end: install, token refresh, `actor=app` attribution
- [ ] Linear rate limits: real numbers, and what a 200-item ladder sync actually costs
- [ ] Linear custom fields: available? on which plans? writable via API?
- [ ] Linear webhook signature scheme; delivery reliability under load
- [ ] `sortOrder` write-back: reorder 50 items, confirm no fractional-precision collisions
- [ ] Jira: 3LO vs. Forge decision, with the distribution tradeoff written down
- [ ] Jira `/issue/rank`: batch limits, partial-failure behavior, time to reorder 100 issues
- [ ] Jira custom field creation via API, or admin-manual?
- [ ] Jira webhooks under 3LO — available, or is polling the only path?
- [ ] Slack: 3s ack + `response_url` swap feels instant on mobile with a real duel card
- [ ] Identity: what fraction of a design partner's stakeholders have no tracker seat? *(This number decides how much invited-voter infrastructure Phase 1 needs.)*
