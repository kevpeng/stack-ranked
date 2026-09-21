# API & Module Contracts

Coordinator-owned. Agents implement against this; nobody edits it unilaterally.

## Deployment shape

Vercel. API is **Next.js route handlers under `app/api/**`** — these deploy as
Vercel functions automatically. There is **no separate backend server** and
nobody should build one.

Scoring runs **synchronously inside the vote request** (docs/05). One voter's
data refits in well under a millisecond; the bootstrap is ~100ms. No queue, no
worker, no Elo, no batch job. If a fit ever feels slow, reduce `bootstrapB` —
do not reintroduce a batch system.

## Database

Drizzle with **`drizzle-orm/pg-core`** (real Postgres schema, prod-accurate).

Two drivers, selected at runtime by `lib/db/client.ts`:
- `DATABASE_URL` set → `@neondatabase/serverless` (Vercel/Neon)
- unset → `@electric-sql/pglite` on disk at `.pglite/` (local dev + tests, no server)

This is why the app runs with zero credentials. Keep both paths working.

## HTTP API

All routes return JSON. Errors: `{ error: string }` with a 4xx/5xx status.
All request bodies are validated with `zod`.

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/api/lists` | `{ name?, capacityItems?, fixture? }` | `{ list: ListConfig }` — creates a list seeded from fixture data |
| GET | `/api/lists` | — | `{ lists: ListConfig[] }` |
| GET | `/api/lists/:id` | — | `{ list, items: Item[], ratings: Rating[], status: ListStatus }` |
| GET | `/api/lists/:id/duel` | — | `{ duel: Duel \| null }` |
| POST | `/api/lists/:id/vote` | `{ itemAId, itemBId, outcome, strategy, isAudit, latencyMs }` | `{ ratings, status, nextDuel: Duel \| null }` |
| GET | `/api/lists/:id/unplaced` | — | `{ items: Item[] }` |
| POST | `/api/lists/:id/place` | `{ itemId, tier }` | `{ duel: Duel \| null, placed: boolean }` |
| GET | `/api/lists/:id/diff` | — | `{ diff: ListDiff }` |

### Notes that matter

- **`/vote` is the hot path.** Insert comparison → refit → recompute ratings →
  select next duel → respond. Target under ~300ms end to end.
- **`/vote` must be idempotent-safe against double-submit.** The UI is
  keyboard-driven and users will double-tap. Dedupe on
  (listId, itemAId, itemBId, createdAt within 500ms).
- **Never return rank or score inside a `Duel`.** The duel card must not leak
  position — anchoring destroys the signal (docs/01, docs/03). `Duel` carries
  `Item`s only, and `Item` has no rank field by construction.

## Module boundaries

```
lib/types.ts            coordinator   shared domain types (frozen-ish)
lib/scoring/contract.ts coordinator   engine signatures
lib/scoring/*           @backend      BT/MM fit, bootstrap, selection
lib/sim/*               @backend      simulation harness
app/api/**              @backend      route handlers
lib/db/*                @db           drizzle schema, client, queries, seed
components/**           @frontend     React components
app/**  (except api)    @frontend     pages, layout, styles
tests/**                @qa           all tests
```

`@backend` consumes `@db`'s query layer. `@frontend` consumes the HTTP API only
— never imports from `lib/db` or `lib/scoring` directly (it would break the
Vercel build by pulling server code into the client bundle).

## Query layer `@db` must export from `lib/db/queries.ts`

`@backend` depends on exactly these. Signatures are fixed:

```ts
createList(input: { name: string; capacityItems: number; items: Item[]; seedOrder: ItemId[] }): Promise<ListConfig>
getList(id: ListId): Promise<ListConfig | null>
listLists(): Promise<ListConfig[]>
getItems(listId: ListId): Promise<Item[]>
getPlacedItems(listId: ListId): Promise<Item[]>
getUnplacedItems(listId: ListId): Promise<Item[]>
placeItem(listId: ListId, itemId: ItemId, tier: Tier): Promise<void>
getComparisons(listId: ListId): Promise<Comparison[]>
insertComparison(c: Omit<Comparison, 'id' | 'createdAt'>): Promise<Comparison>
recentDuplicateComparison(listId: ListId, aId: ItemId, bId: ItemId, withinMs: number): Promise<boolean>
```

Ratings are **derived, not stored** in this MVP — recompute per request from the
comparison log. (docs/05 keeps a `ratings` table for later caching; not needed
at this size and it would be one more thing to invalidate.)
