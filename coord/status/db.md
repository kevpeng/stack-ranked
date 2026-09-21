# @db — status

**State:** in progress
**Last updated:** 2026-09-21 (start)

## Currently editing
Reading contracts/types/architecture docs, then starting on
`lib/db/schema.ts`.

## Plan
1. `lib/db/schema.ts` — drizzle-orm/pg-core schema: lists, items, listItems,
   comparisons (append-only). Trimmed MVP per instructions (no pins,
   applications, audit_log, connections, organizations, users — single
   hardcoded dev voter id).
2. `lib/db/client.ts` — dual driver getDb(), memoized, ensureSchema() via
   CREATE TABLE IF NOT EXISTS so PGlite path needs zero setup.
3. `lib/db/queries.ts` — exact signatures from CONTRACTS.md, mapping DB rows
   to lib/types.ts domain objects.
4. `lib/db/fixtures.ts` — ~60 realistic B2B SaaS backlog items.
5. `lib/db/seed.ts` — tsx-runnable idempotent seed script.

## Done
_(nothing yet)_

## Needs from others
_(nothing yet)_

## Blocked / questions for coordinator
_(nothing yet)_
