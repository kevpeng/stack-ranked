/**
 * GET /api/lists/:id — coord/CONTRACTS.md "HTTP API".
 * Owned by @backend.
 *
 * `ratings` covers EVERY item in the list, placed or not: the engine's
 * regularization + cold-start seed prior (docs/02 §3.2, §5) already gives
 * an unplaced item a finite, honestly-uncertain provisional rating, and
 * the seed-vs-settled diff (/diff) needs every item to have a settled
 * rank to compare against its seed rank. `status.placedCount` /
 * `unplacedCount` — not `ratings` membership — are what distinguish
 * "actually placed" from "provisional only" for the UI.
 */

import { NextResponse } from 'next/server';
import { getList, getItems, getPlacedItems, getUnplacedItems, getComparisons } from '@/lib/db/queries';
import { computeRatings, computeListStatus } from '@/lib/scoring';
import { jsonError, scoringParamsFor, requestSeed } from '@/app/api/_shared';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) return jsonError('list not found', 404);

  const [items, placedItems, unplacedItems, comparisons] = await Promise.all([
    getItems(id),
    getPlacedItems(id),
    getUnplacedItems(id),
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
  const status = computeListStatus({
    ratings: placedRatings,
    comparisons,
    items: placedItems,
    params: scoringParams,
    unplacedCount: unplacedItems.length,
  });

  return NextResponse.json({ list, items, ratings, status });
}
