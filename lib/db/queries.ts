/**
 * Query layer — owned by @db. @backend codes against these exact signatures
 * (coord/CONTRACTS.md — "Query layer"). Do not rename or re-shape them.
 *
 * Every function maps DB rows to the domain types in lib/types.ts — callers
 * never see raw Drizzle rows.
 *
 * Ratings are derived, not stored (see coord/CONTRACTS.md), so there is no
 * ratings query here — @backend recomputes them from getComparisons().
 *
 * `comparisons` is append-only: insertComparison() is the only write this
 * file exposes for that table. Never add an update/delete for it.
 *
 * Neon's HTTP driver does not support interactive transactions
 * (`db.transaction()` throws "No transactions support in neon-http
 * driver"), so multi-statement writes below are sequential/batched instead
 * of wrapped in a transaction. That's fine here: creation is a one-time
 * setup step and the comparison log is the only thing that must never be
 * partially written, and a single insertComparison() is already atomic.
 */

import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, isNull, isNotNull, or, sql } from 'drizzle-orm';
import { getDb, DEV_VOTER_ID } from './client';
import { comparisons, items, listItems, lists } from './schema';
import { DEFAULT_PARAMS } from '../types';
import type {
  Comparison,
  Evidence,
  Item,
  ItemId,
  ItemState,
  ListConfig,
  ListId,
  Outcome,
  DuelStrategy,
  Tier,
} from '../types';

// ---------------------------------------------------------------------------
// Row -> domain mapping
// ---------------------------------------------------------------------------

type ItemRow = typeof items.$inferSelect;
type ListRow = typeof lists.$inferSelect;
type ComparisonRow = typeof comparisons.$inferSelect;

function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    externalKey: row.externalKey,
    title: row.title,
    summaryLine: row.summaryLine,
    labels: (row.labels ?? []) as string[],
    estimate: row.estimate,
    state: row.state as ItemState,
    evidence: (row.evidence ?? {}) as Evidence,
    createdAtExternal: row.createdAtExternal.toISOString(),
    externalPriority: row.externalPriority,
    externalSortOrder: row.externalSortOrder,
  };
}

function rowToListConfig(row: ListRow): ListConfig {
  return {
    id: row.id,
    name: row.name,
    capacityItems: row.capacityItems,
    decayHalflifeDays: row.decayHalflifeDays,
    seedOrder: (row.seedOrder ?? []) as ItemId[],
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToComparison(row: ComparisonRow): Comparison {
  return {
    id: row.id,
    listId: row.listId,
    voterId: row.voterId,
    itemAId: row.itemAId,
    itemBId: row.itemBId,
    outcome: row.outcome as Outcome,
    strategy: row.strategy as DuelStrategy,
    isAudit: row.isAudit,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function createList(input: {
  name: string;
  capacityItems: number;
  items: Item[];
  seedOrder: ItemId[];
}): Promise<ListConfig> {
  const db = await getDb();

  const listId = randomUUID();
  const now = new Date();

  const [listRow] = await db
    .insert(lists)
    .values({
      id: listId,
      name: input.name,
      capacityItems: input.capacityItems,
      decayHalflifeDays: DEFAULT_PARAMS.decayHalflifeDays,
      seedOrder: input.seedOrder,
      createdAt: now,
    })
    .returning();

  if (input.items.length > 0) {
    await db.insert(items).values(
      input.items.map((item) => ({
        id: item.id,
        listId,
        externalKey: item.externalKey,
        title: item.title,
        summaryLine: item.summaryLine,
        labels: item.labels,
        estimate: item.estimate,
        state: item.state,
        evidence: item.evidence,
        createdAtExternal: new Date(item.createdAtExternal),
        externalPriority: item.externalPriority,
        externalSortOrder: item.externalSortOrder,
      })),
    );

    // Seeded items arrive PLACED, carrying the order inherited from the
    // tracker (docs/02 §5, docs/01 onboarding loop): the list opens as
    // "Seeded - 0% confident", meaning every item already has a provisional
    // position but no evidence behind it yet. That seeded order is exactly
    // what the ~180-duel onboarding session then refines, and what /diff
    // later compares against.
    //
    // The Unplaced queue (placedAt null) is for items that arrive AFTER
    // creation via the intake loop (docs/01 loop 2) -- a request nobody has
    // ranked yet. Starting seeded items there instead left a fresh list with
    // placedCount 0, so /duel had no pair to offer and onboarding could
    // never begin.
    //
    // tier stays null: a tier is the coarse bucket a human picks while
    // placing an item by hand, and a seeded item has not been bucketed.
    await db.insert(listItems).values(
      input.items.map((item) => ({
        listId,
        itemId: item.id,
        tier: null,
        placedAt: now,
      })),
    );
  }

  return rowToListConfig(listRow);
}

export async function getList(id: ListId): Promise<ListConfig | null> {
  const db = await getDb();
  const [row] = await db.select().from(lists).where(eq(lists.id, id)).limit(1);
  return row ? rowToListConfig(row) : null;
}

export async function listLists(): Promise<ListConfig[]> {
  const db = await getDb();
  const rows = await db.select().from(lists).orderBy(asc(lists.createdAt));
  return rows.map(rowToListConfig);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Deterministic ordering for all three item queries below: seed-ish order. */
const ITEM_ORDER = [
  asc(sql`${items.externalSortOrder} IS NULL`),
  asc(items.externalSortOrder),
  asc(items.title),
] as const;

export async function getItems(listId: ListId): Promise<Item[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(items)
    .where(eq(items.listId, listId))
    .orderBy(...ITEM_ORDER);
  return rows.map(rowToItem);
}

export async function getPlacedItems(listId: ListId): Promise<Item[]> {
  const db = await getDb();
  const rows = await db
    .select({ item: items })
    .from(items)
    .innerJoin(listItems, and(eq(listItems.listId, items.listId), eq(listItems.itemId, items.id)))
    .where(and(eq(items.listId, listId), isNotNull(listItems.placedAt)))
    .orderBy(...ITEM_ORDER);
  return rows.map((r) => rowToItem(r.item));
}

export async function getUnplacedItems(listId: ListId): Promise<Item[]> {
  const db = await getDb();
  const rows = await db
    .select({ item: items })
    .from(items)
    .innerJoin(listItems, and(eq(listItems.listId, items.listId), eq(listItems.itemId, items.id)))
    .where(and(eq(items.listId, listId), isNull(listItems.placedAt)))
    .orderBy(...ITEM_ORDER);
  return rows.map((r) => rowToItem(r.item));
}

export async function placeItem(listId: ListId, itemId: ItemId, tier: Tier): Promise<void> {
  const db = await getDb();
  const now = new Date();

  await db
    .insert(listItems)
    .values({ listId, itemId, tier, placedAt: now })
    .onConflictDoUpdate({
      target: [listItems.listId, listItems.itemId],
      set: { tier, placedAt: now },
    });
}

// ---------------------------------------------------------------------------
// Comparisons (append-only)
// ---------------------------------------------------------------------------

export async function getComparisons(listId: ListId): Promise<Comparison[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(comparisons)
    .where(eq(comparisons.listId, listId))
    .orderBy(asc(comparisons.createdAt));
  return rows.map(rowToComparison);
}

export async function insertComparison(
  c: Omit<Comparison, 'id' | 'createdAt'>,
): Promise<Comparison> {
  const db = await getDb();

  const [row] = await db
    .insert(comparisons)
    .values({
      id: randomUUID(),
      listId: c.listId,
      voterId: c.voterId ?? DEV_VOTER_ID,
      itemAId: c.itemAId,
      itemBId: c.itemBId,
      outcome: c.outcome,
      strategy: c.strategy,
      isAudit: c.isAudit,
      latencyMs: c.latencyMs,
      createdAt: new Date(),
    })
    .returning();

  return rowToComparison(row);
}

/**
 * Guards against keyboard double-submits on POST /api/lists/:id/vote
 * (coord/CONTRACTS.md — "/vote must be idempotent-safe against
 * double-submit"). Matches the pair in either order, since a double-tap
 * resubmits the same duel with the same (itemAId, itemBId) as shown.
 */
export async function recentDuplicateComparison(
  listId: ListId,
  aId: ItemId,
  bId: ItemId,
  withinMs: number,
): Promise<boolean> {
  const db = await getDb();
  const since = new Date(Date.now() - withinMs);

  const rows = await db
    .select({ id: comparisons.id })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.listId, listId),
        gte(comparisons.createdAt, since),
        or(
          and(eq(comparisons.itemAId, aId), eq(comparisons.itemBId, bId)),
          and(eq(comparisons.itemAId, bId), eq(comparisons.itemBId, aId)),
        ),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
