/**
 * Drizzle schema — owned by @db.
 *
 * Uses drizzle-orm/pg-core (real Postgres types) so the exact same schema
 * definition works against both Neon (drizzle-orm/neon-http) and PGlite
 * (drizzle-orm/pglite) — see lib/db/client.ts for driver selection.
 *
 * Trimmed to MVP per coord/DASHBOARD.md + coord/CONTRACTS.md: no `pins`,
 * `applications`, `audit_log`, `connections`, `organizations`, `users`.
 * Single hardcoded dev voter id (see DEV_VOTER_ID in lib/db/client.ts).
 *
 * Enum-shaped columns (state, outcome, strategy, tier) are plain `text`
 * rather than pg enums: a `CREATE TYPE` is not `IF NOT EXISTS`-safe, and
 * enum validity is already enforced at the API boundary with zod
 * (coord/CONTRACTS.md — "All request bodies are validated with zod").
 * TypeScript unions from lib/types.ts are cast on the way in and out.
 *
 * IDs are generated in application code (crypto.randomUUID(), see
 * lib/db/queries.ts) rather than via DB defaults — identical behavior on
 * both drivers and no dependence on gen_random_uuid() availability.
 */

import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** docs/05 §"Lists". `seedOrder` is kept forever — powers the seed/settled diff. */
export const lists = pgTable('lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  capacityItems: integer('capacity_items').notNull(),
  decayHalflifeDays: integer('decay_halflife_days').notNull(),
  /** ItemId[], in seed (tracker) order. Never cleared. */
  seedOrder: jsonb('seed_order').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Mirrored tracker tickets (trimmed — no connection/org/provider columns for MVP). */
export const items = pgTable('items', {
  id: text('id').primaryKey(),
  listId: text('list_id')
    .notNull()
    .references(() => lists.id, { onDelete: 'cascade' }),
  /** Display key from the tracker, e.g. "ENG-123". Never a join key. */
  externalKey: text('external_key').notNull(),
  title: text('title').notNull(),
  /** The single line shown on a duel card. */
  summaryLine: text('summary_line').notNull(),
  labels: jsonb('labels').$type<string[]>().notNull().default([]),
  /** Relative size if the tracker has one. Chip only — not used in scoring. */
  estimate: doublePrecision('estimate'),
  /** ItemState: 'active' | 'completed' | 'canceled'. */
  state: text('state').notNull(),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  createdAtExternal: timestamp('created_at_external', { withTimezone: true }).notNull(),
  /** Linear priority 0-4. Cold-start seed only. */
  externalPriority: integer('external_priority'),
  /** Linear sortOrder float. Cold-start seed only. */
  externalSortOrder: doublePrecision('external_sort_order'),
});

/** Placement into a list. Absence of `placedAt` ⇒ the Unplaced queue. */
export const listItems = pgTable(
  'list_items',
  {
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    /** Tier: 'now' | 'next' | 'later' | 'never'. Null until placement starts. */
    tier: text('tier'),
    placedAt: timestamp('placed_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.itemId] }),
    uniqueIndex('list_items_list_id_item_id_idx').on(table.listId, table.itemId),
  ],
);

/**
 * The event log. Source of truth. APPEND-ONLY — never expose an update or
 * delete for this table from lib/db/queries.ts.
 */
export const comparisons = pgTable(
  'comparisons',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    /** One voter today; column present so multiplayer stays additive (docs/08). */
    voterId: text('voter_id').notNull(),
    itemAId: text('item_a_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    itemBId: text('item_b_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    /** Outcome: 'a' | 'b' | 'tie'. */
    outcome: text('outcome').notNull(),
    /** DuelStrategy: 'placement' | 'infogain' | 'cutline' | 'audit'. */
    strategy: text('strategy').notNull(),
    /** Held out of the fit; used only to measure self-consistency. */
    isAudit: boolean('is_audit').notNull().default(false),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('comparisons_list_id_created_at_idx').on(table.listId, table.createdAt)],
);
