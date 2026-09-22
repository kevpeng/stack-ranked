/**
 * GET /api/lists/:id/duel — coord/CONTRACTS.md "HTTP API".
 * Owned by @backend.
 *
 * Maintenance duel selection (infogain/cutline/audit) among already-PLACED
 * items only. A new/unplaced item's binary-search placement duels come
 * from POST /place instead (docs/02 §2.1 vs §2.2-§2.4 are deliberately
 * different endpoints — see coord/status/backend.md for why).
 */

import { NextResponse } from 'next/server';
import { getList, getItems, getPlacedItems, getComparisons } from '@/lib/db/queries';
import { computeRatings, selectNextDuel } from '@/lib/scoring';
import { jsonError, scoringParamsFor, requestSeed } from '@/app/api/_shared';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) return jsonError('list not found', 404);

  const [items, placedItems, comparisons] = await Promise.all([
    getItems(id),
    getPlacedItems(id),
    getComparisons(id),
  ]);

  const scoringParams = scoringParamsFor(list);
  const ratings = computeRatings({
    items,
    comparisons,
    params: scoringParams,
    seedOrder: list.seedOrder,
    capacityItems: list.capacityItems,
    seed: requestSeed(),
  });

  const placedIds = new Set(placedItems.map((it) => it.id));
  const placedRatings = ratings.filter((r) => placedIds.has(r.itemId));

  const duel = selectNextDuel({
    items,
    comparisons,
    params: scoringParams,
    capacityItems: list.capacityItems,
    ratings: placedRatings,
    seed: requestSeed(),
  });

  return NextResponse.json({ duel });
}
