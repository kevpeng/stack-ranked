/**
 * POST /api/lists/:id/place — coord/CONTRACTS.md "HTTP API".
 * Owned by @backend.
 *
 * Idempotent and re-callable: the first call for an item marks it placed
 * (docs/02 §2.1 — "the item lands immediately") and returns the first
 * binary-search probe; the frontend then submits that duel through
 * POST /vote and calls THIS endpoint again with the SAME {itemId, tier} to
 * get the next probe, until `duel` comes back null (converged, or
 * maxPlacementTaps reached).
 *
 * Why placement continuation is driven by re-calling /place rather than
 * by POST /vote's `nextDuel`: the query layer (lib/db/queries.ts,
 * @db-owned, signatures frozen in CONTRACTS.md) has no place to persist
 * "which item + tier is mid-placement" — `placeItem()` sets `placedAt`
 * immediately on first call, and /vote's request body (also frozen) has
 * no `tier` field to carry it. The frontend already knows both (it drove
 * the flow), so re-supplying them here is the only place that state can
 * live without changing a contract owned elsewhere. Each call
 * reconstructs the binary-search bounds by replaying this item's
 * strategy='placement' comparisons from the log (see
 * lib/scoring/placement.ts) — nothing about it depends on server memory.
 */

import { NextResponse } from 'next/server';
import { getList, getItems, getPlacedItems, getComparisons, placeItem } from '@/lib/db/queries';
import { computeRatings, nextPlacementDuel } from '@/lib/scoring';
import { jsonError, parseJsonBody, placeBodySchema, scoringParamsFor, requestSeed } from '@/app/api/_shared';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) return jsonError('list not found', 404);

  const rawBody = await parseJsonBody(req);
  const parsed = placeBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }
  const { itemId, tier } = parsed.data;

  const items = await getItems(id);
  const item = items.find((it) => it.id === itemId);
  if (!item) return jsonError('item not found in this list', 404);

  await placeItem(id, itemId, tier);

  const [placedItems, comparisons] = await Promise.all([getPlacedItems(id), getComparisons(id)]);

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
  const ranked = ratings.filter((r) => placedIds.has(r.itemId) && r.itemId !== itemId);

  const placementComparisons = comparisons.filter(
    (c) => c.strategy === 'placement' && (c.itemAId === itemId || c.itemBId === itemId),
  );

  const duel = nextPlacementDuel({
    item,
    tier,
    ranked,
    items,
    placementComparisons,
    params: scoringParams,
    seed: requestSeed(),
  });

  return NextResponse.json({ duel, placed: true });
}
