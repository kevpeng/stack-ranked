/**
 * Round-trip tests for lib/db/queries.ts against the signatures fixed in
 * coord/CONTRACTS.md. Runs against PGlite (no DATABASE_URL needed, per
 * CONTRACTS.md "Database" section) — zero setup.
 */
import { describe, expect, it } from 'vitest';
import {
  createList, getComparisons, getItems, getList, getPlacedItems, getUnplacedItems,
  insertComparison, listLists, placeItem, recentDuplicateComparison,
} from '@/lib/db/queries';
import type { Item } from '@/lib/types';
import { makeItem } from '@/tests/helpers/factories';

function uniqueName(label: string): string {
  return `qa-db-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// PGlite persists to disk across `npm test` runs (see coord/status/db.md) —
// item ids must be unique per run, not just per test, or a re-run collides
// on the `items` primary key.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function id(label: string): string {
  return `${RUN_ID}-${label}`;
}

describe('lib/db/queries — round trip', () => {
  it('creates a list and reads it back with getList', async () => {
    const items: Item[] = [makeItem(id('db-a1')), makeItem(id('db-b1')), makeItem(id('db-c1'))];
    const name = uniqueName('create');

    const created = await createList({
      name, capacityItems: 2, items, seedOrder: items.map((i) => i.id),
    });

    expect(created.id).toBeTruthy();
    expect(created.name).toBe(name);
    expect(created.capacityItems).toBe(2);
    expect(created.seedOrder).toEqual(items.map((i) => i.id));

    const fetched = await getList(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe(name);
    expect(fetched!.seedOrder).toEqual(items.map((i) => i.id));
  });

  it('getList returns null for a non-existent id', async () => {
    const fetched = await getList('not-a-real-list-id-00000000');
    expect(fetched).toBeNull();
  });

  it('a created list shows up in listLists()', async () => {
    const items = [makeItem(id('db-l1'))];
    const name = uniqueName('listlists');
    const created = await createList({ name, capacityItems: 1, items, seedOrder: items.map((i) => i.id) });

    const all = await listLists();
    expect(all.some((l) => l.id === created.id)).toBe(true);
  });

  it('newly created items start unplaced', async () => {
    const items = [makeItem(id('db-u1')), makeItem(id('db-u2'))];
    const created = await createList({
      name: uniqueName('unplaced'), capacityItems: 1, items, seedOrder: items.map((i) => i.id),
    });

    const all = await getItems(created.id);
    expect(all.map((i) => i.id).sort()).toEqual(items.map((i) => i.id).sort());

    const unplaced = await getUnplacedItems(created.id);
    expect(unplaced.map((i) => i.id).sort()).toEqual(items.map((i) => i.id).sort());

    const placed = await getPlacedItems(created.id);
    expect(placed).toEqual([]);
  });

  it('placeItem moves an item from unplaced to placed', async () => {
    const items = [makeItem(id('db-p1')), makeItem(id('db-p2'))];
    const created = await createList({
      name: uniqueName('place'), capacityItems: 1, items, seedOrder: items.map((i) => i.id),
    });

    await placeItem(created.id, items[0].id, 'now');

    const placed = await getPlacedItems(created.id);
    const unplaced = await getUnplacedItems(created.id);
    expect(placed.map((i) => i.id)).toEqual([items[0].id]);
    expect(unplaced.map((i) => i.id)).toEqual([items[1].id]);
  });

  it('inserts a comparison and reads it back via getComparisons', async () => {
    const items = [makeItem(id('db-c1a')), makeItem(id('db-c1b'))];
    const created = await createList({
      name: uniqueName('cmp'), capacityItems: 1, items, seedOrder: items.map((i) => i.id),
    });

    const inserted = await insertComparison({
      listId: created.id,
      voterId: 'voter-qa',
      itemAId: items[0].id,
      itemBId: items[1].id,
      outcome: 'a',
      strategy: 'infogain',
      isAudit: false,
      latencyMs: 1200,
    });

    expect(inserted.id).toBeTruthy();
    expect(inserted.createdAt).toBeTruthy();

    const all = await getComparisons(created.id);
    const found = all.find((c) => c.id === inserted.id);
    expect(found).toBeDefined();
    expect(found!.itemAId).toBe(items[0].id);
    expect(found!.itemBId).toBe(items[1].id);
    expect(found!.outcome).toBe('a');
    expect(found!.isAudit).toBe(false);
  });

  it('recentDuplicateComparison finds a just-inserted pair and not an unrelated pair', async () => {
    const items = [makeItem(id('db-d1')), makeItem(id('db-d2')), makeItem(id('db-d3'))];
    const created = await createList({
      name: uniqueName('dup'), capacityItems: 1, items, seedOrder: items.map((i) => i.id),
    });

    await insertComparison({
      listId: created.id,
      voterId: 'voter-qa',
      itemAId: items[0].id,
      itemBId: items[1].id,
      outcome: 'a',
      strategy: 'infogain',
      isAudit: false,
      latencyMs: null,
    });

    const isDup = await recentDuplicateComparison(created.id, items[0].id, items[1].id, 500);
    expect(isDup).toBe(true);

    const isDifferentPair = await recentDuplicateComparison(created.id, items[0].id, items[2].id, 500);
    expect(isDifferentPair).toBe(false);
  });

  it('the comparison log is append-only in practice: no update/delete exported for comparisons', async () => {
    const mod: Record<string, unknown> = await import('@/lib/db/queries');
    const forbidden = ['updatecomparison', 'deletecomparison', 'removecomparison', 'editcomparison'];
    for (const exportName of Object.keys(mod)) {
      expect(forbidden).not.toContain(exportName.toLowerCase());
    }
  });
});
