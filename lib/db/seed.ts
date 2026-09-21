/**
 * tsx-runnable seed script — `npm run db:seed`.
 *
 * Ensures the schema exists (via getDb()), creates a demo list from
 * lib/db/fixtures.ts, computes seedOrder from externalSortOrder (falling
 * back to externalPriority, then title, for any tie), and prints the list
 * id.
 *
 * Idempotent: re-running deletes the previous demo list (identified by
 * name — see DEMO_LIST_NAME below) before creating a fresh one, so the
 * database resets cleanly instead of accumulating duplicate demo lists.
 * FK cascades (see lib/db/schema.ts) take items/listItems/comparisons with
 * it.
 */

import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { lists } from './schema';
import { createList } from './queries';
import { SEED_ITEMS } from './fixtures';
import type { ItemId } from '../types';

const DEMO_LIST_NAME = 'Product Backlog (Demo)';
const DEMO_CAPACITY_ITEMS = 15;

function computeSeedOrder(items: typeof SEED_ITEMS): ItemId[] {
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

async function main() {
  const db = await getDb();

  // Idempotent reset: remove any previous demo list (and, via ON DELETE
  // CASCADE, its items/listItems/comparisons) before recreating it.
  const existing = await db
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.name, DEMO_LIST_NAME));

  for (const row of existing) {
    await db.delete(lists).where(eq(lists.id, row.id));
  }
  if (existing.length > 0) {
    console.log(`Removed ${existing.length} previous "${DEMO_LIST_NAME}" list(s).`);
  }

  const seedOrder = computeSeedOrder(SEED_ITEMS);

  const list = await createList({
    name: DEMO_LIST_NAME,
    capacityItems: DEMO_CAPACITY_ITEMS,
    items: SEED_ITEMS,
    seedOrder,
  });

  console.log(`Seeded "${list.name}" with ${SEED_ITEMS.length} items.`);
  console.log(`List id: ${list.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
