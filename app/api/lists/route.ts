/**
 * POST /api/lists, GET /api/lists — coord/CONTRACTS.md "HTTP API".
 * Owned by @backend.
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createList, listLists } from '@/lib/db/queries';
import { SEED_ITEMS } from '@/lib/db/fixtures';
import type { Item, ItemId } from '@/lib/types';
import { createListBodySchema, jsonError, parseJsonBody } from '@/app/api/_shared';

const DEFAULT_CAPACITY_FRACTION = 0.25;
const MIN_CAPACITY = 3;

/** Same ordering seed.ts uses for the demo list (tracker sortOrder, falling
 * back to priority, then title) — reproduced here rather than imported
 * because lib/db/seed.ts is an executable script (it calls main() at
 * import time), not a module meant to be imported. */
function computeSeedOrder(items: Item[]): ItemId[] {
  return [...items]
    .sort((a, b) => {
      const aSort = a.externalSortOrder ?? Number.POSITIVE_INFINITY;
      const bSort = b.externalSortOrder ?? Number.POSITIVE_INFINITY;
      if (aSort !== bSort) return aSort - bSort;
      const aPriority = a.externalPriority ?? Number.POSITIVE_INFINITY;
      const bPriority = b.externalPriority ?? Number.POSITIVE_INFINITY;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.title.localeCompare(b.title);
    })
    .map((item) => item.id);
}

export async function GET(_req: Request) {
  const lists = await listLists();
  return NextResponse.json({ lists });
}

export async function POST(req: Request) {
  const rawBody = await parseJsonBody(req);
  const parsed = createListBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }
  const { name, capacityItems, fixture } = parsed.data;
  const useFixture = fixture ?? true;

  // Fresh ids per list: `items.id` is a global primary key (lib/db/schema.ts),
  // and SEED_ITEMS' ids are fixed slugs shared with the db:seed demo list —
  // reusing them here would collide on a second fixture-seeded list.
  const items: Item[] = useFixture ? SEED_ITEMS.map((it) => ({ ...it, id: randomUUID() })) : [];
  const seedOrder = computeSeedOrder(items);
  const capacity = capacityItems ?? Math.max(MIN_CAPACITY, Math.round(items.length * DEFAULT_CAPACITY_FRACTION));

  const list = await createList({
    name: name ?? (useFixture ? 'Product Backlog' : 'New List'),
    capacityItems: capacity,
    items,
    seedOrder,
  });

  return NextResponse.json({ list }, { status: 201 });
}
