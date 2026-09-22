/**
 * GET /api/lists/:id/diff — coord/CONTRACTS.md "HTTP API".
 *
 * The seed-vs-settled comparison: where the tracker's stored order and the
 * owner's actual judgement disagree. This is the product's first-session
 * payoff (docs/02 §5, docs/03 §1), which is why `lists.seedOrder` is kept
 * forever rather than discarded after onboarding.
 *
 * Ranks are 1-indexed. `delta` is positive when an item RISES (seed #38 ->
 * settled #6 gives delta +32), which is the direction the UI reads as an
 * improvement.
 *
 * Written by the coordinator: @backend was cut off by a rate limit before
 * landing this last route. Follows the conventions in the sibling routes.
 */

import { NextResponse } from 'next/server';
import { getList, getItems, getComparisons } from '@/lib/db/queries';
import { computeRatings } from '@/lib/scoring';
import { jsonError, scoringParamsFor, requestSeed } from '@/app/api/_shared';
import type { DiffRow, ListDiff } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) return jsonError('list not found', 404);

  const [items, comparisons] = await Promise.all([getItems(id), getComparisons(id)]);

  const ratings = computeRatings({
    items,
    comparisons,
    params: scoringParamsFor(list),
    seedOrder: list.seedOrder,
    capacityItems: list.capacityItems,
    seed: requestSeed(),
  });

  // Seed rank comes from the stored seedOrder. An item absent from it (added
  // after the list was created) has no seed position to compare against, so
  // it is excluded rather than given a fabricated one.
  const seedRankById = new Map<string, number>();
  list.seedOrder.forEach((itemId, i) => seedRankById.set(itemId, i + 1));

  const settledRankById = new Map(ratings.map((r) => [r.itemId, r.rank]));
  const titleById = new Map(items.map((it) => [it.id, it.title]));
  const cap = list.capacityItems;

  const rows: DiffRow[] = [];
  for (const [itemId, seedRank] of seedRankById) {
    const settledRank = settledRankById.get(itemId);
    if (settledRank === undefined) continue; // item deleted upstream
    rows.push({
      itemId,
      title: titleById.get(itemId) ?? itemId,
      seedRank,
      settledRank,
      delta: seedRank - settledRank,
      crossedCutline: seedRank <= cap !== settledRank <= cap,
    });
  }

  rows.sort((a, b) => a.settledRank - b.settledRank);

  const moved = rows.filter((r) => r.delta !== 0);
  // Only a genuine move can be the biggest mover; on an unstarted list every
  // delta is 0 and both come back null rather than an arbitrary row.
  const risers = moved.filter((r) => r.delta > 0);
  const fallers = moved.filter((r) => r.delta < 0);

  const diff: ListDiff = {
    movedCount: moved.length,
    totalCount: rows.length,
    crossedCutlineCount: rows.filter((r) => r.crossedCutline).length,
    biggestRiser: risers.length
      ? risers.reduce((best, r) => (r.delta > best.delta ? r : best))
      : null,
    biggestFaller: fallers.length
      ? fallers.reduce((best, r) => (r.delta < best.delta ? r : best))
      : null,
    rows,
  };

  return NextResponse.json({ diff });
}
