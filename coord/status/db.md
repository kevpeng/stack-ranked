# @db — status

**State:** DONE
**Last updated:** 2026-09-21

## Done
All 5 deliverables landed, in `lib/db/**` only:

1. **`lib/db/schema.ts`** — `drizzle-orm/pg-core` schema: `lists`, `items`,
   `listItems` (composite PK `(listId, itemId)` — doubles as the required
   unique constraint), `comparisons` (append-only, index on
   `(listId, createdAt)`). Trimmed to MVP exactly as instructed (no pins,
   applications, audit_log, connections, organizations, users). Enum-shaped
   columns (`state`, `outcome`, `strategy`, `tier`) are plain `text`, not pg
   enums — `CREATE TYPE` isn't `IF NOT EXISTS`-safe and validity is enforced
   at the zod boundary per CONTRACTS.md. IDs are `text`, generated in
   application code via `crypto.randomUUID()` (not DB defaults) — identical
   behavior on both drivers.

2. **`lib/db/client.ts`** — `getDb()`, memoized (caches the init promise; a
   failed init is not cached, so the next call retries cleanly). `DATABASE_URL`
   set → `@neondatabase/serverless` + `drizzle-orm/neon-http`; unset →
   `@electric-sql/pglite` persisted at `.pglite/` + `drizzle-orm/pglite`.
   `ensureSchema()` runs idempotent `CREATE TABLE IF NOT EXISTS` for every
   table before handing back the connection — runs on both driver paths
   (harmless on Neon, required for PGlite's zero-setup promise). Also
   exports `DEV_VOTER_ID = 'dev-voter'` (the single hardcoded voter for this
   MVP) and `AppDb` (the `NeonHttpDatabase | PgliteDatabase` union type).
   **Note for @backend:** `db.transaction()` is NOT available — the
   neon-http driver throws `"No transactions support in neon-http driver"`
   at runtime for any transaction. Nothing in `lib/db/queries.ts` uses one;
   if you need multi-statement atomicity anywhere in scoring/API code,
   you'll need to design around this (sequential writes, or accept
   best-effort), not reach for `db.transaction()`.

3. **`lib/db/queries.ts`** — all 10 signatures from CONTRACTS.md, exact
   names/shapes, mapping DB rows to `lib/types.ts` domain objects (no raw
   Drizzle rows leak out). `createList` also creates a `listItems` row per
   item (tier=null, placedAt=null → Unplaced queue) so
   `getUnplacedItems`/`getPlacedItems` work immediately after creation.
   `getItems`/`getPlacedItems`/`getUnplacedItems` share one deterministic
   order (`externalSortOrder` ASC nulls-last, then title). `placeItem` is an
   upsert (`onConflictDoUpdate` on the `(listId, itemId)` PK) so it's safe to
   call more than once for the same item. `insertComparison` is the only
   write `comparisons` ever gets — no update/delete exposed anywhere.
   `recentDuplicateComparison` matches the pair in either order
   (`(a,b)` or `(b,a)`) within the given window, since a double-tap resubmits
   the same duel with the same `(itemAId, itemBId)`.

4. **`lib/db/fixtures.ts`** — 60 hand-written B2B SaaS backlog items across
   security/growth/ops/infra/billing/mobile/dx. Real evidence mix (ARR,
   customer counts, requester+role, or deliberately thin). The array's
   *order* IS the seed order: items 1-20 are genuinely defensible
   (compliance/reliability/revenue items with real numbers, in impact
   order); items 21-60 are shuffled on purpose — some high-value items
   buried (e.g. a compliance-blocked $95k renewal sitting at #23, SOC2
   automation burning 10hrs/week at #46), some weak/low-evidence items
   sitting suspiciously high (a GraphQL beta nobody asked for tagged
   "urgent" at #21). `externalPriority` is hand-set and deliberately noisy
   below the top 20 (stale/optimistic tags). `externalSortOrder` is
   *derived* from array position (strictly increasing, non-round, via a
   small formula) so it can never drift from the authored order.

5. **`lib/db/seed.ts`** — `npm run db:seed` / `npx tsx lib/db/seed.ts`.
   Idempotent: deletes any previous list named "Product Backlog (Demo)"
   first (FK cascades take its items/listItems/comparisons with it), then
   recreates from fixtures. Computes `seedOrder` by sorting on
   `externalSortOrder` (nulls-last), tie-broken by `externalPriority`, then
   title. Prints the list id.

## Verified (real output, not claimed)

Clean run, `.pglite/` deleted first, `DATABASE_URL` unset:
```
$ rm -rf .pglite && npx tsx lib/db/seed.ts
Seeded "Product Backlog (Demo)" with 60 items.
List id: c43eb86f-c860-42b0-8d0d-04c6b9931754
```
Re-run immediately after (idempotency check):
```
Removed 1 previous "Product Backlog (Demo)" list(s).
Seeded "Product Backlog (Demo)" with 60 items.
List id: <new-uuid>
```
Also manually exercised every `queries.ts` function (getList, listLists,
getItems, getPlacedItems/getUnplacedItems before+after placeItem,
insertComparison, getComparisons, recentDuplicateComparison in both pair
orders and outside its window) against the seeded PGlite data — all correct,
no throws. Also confirmed `getDb()` works under vitest (ad hoc config
pointed at a scratch test file, not committed anywhere) — resolves fine with
no `DATABASE_URL`, reuses the same persisted `.pglite/` data.

`npx tsc --noEmit`: zero errors in `lib/db/**`. (Whole-repo run currently
shows pre-existing errors in `tests/**` referencing `@/lib/scoring`, which
doesn't exist yet — that's @backend/@qa's in-progress work, not mine.)

## Needs from others
Nothing blocking. @backend confirmed (in their status file) that
`queries.ts` already matches CONTRACTS.md and they're coding against it.

## Blocked / questions for coordinator
None.

## For @qa
`lib/db/client.ts` exports `__resetDbForTests()` if you need to force a
fresh connection/PGlite instance mid-suite (e.g. between test files that
each want a clean DB) — it just clears the memoized promise so the next
`getDb()` call re-opens. It does NOT delete `.pglite/` data on disk; combine
with deleting the seeded demo list (or pointing `DATABASE_URL`-less runs at
a different cwd) if you need a truly empty DB per test file.
