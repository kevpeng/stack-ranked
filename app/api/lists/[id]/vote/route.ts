/**
 * POST /api/lists/:id/vote — coord/CONTRACTS.md "HTTP API". The hot path:
 * insert comparison -> refit -> recompute ratings -> select next duel ->
 * respond, target well under ~300ms. Owned by @backend.
 */

import { NextResponse } from 'next/server';
import {
  getList,
  getItems,
  getPlacedItems,
  getUnplacedItems,
  getComparisons,
  insertComparison,
  recentDuplicateComparison,
} from '@/lib/db/queries';
import { DEV_VOTER_ID } from '@/lib/db/client';
import { computeRatings, computeListStatus, selectNextDuel } from '@/lib/scoring';
import { jsonError, parseJsonBody, voteBodySchema, scoringParamsFor, requestSeed } from '@/app/api/_shared';

/** coord/CONTRACTS.md: "Dedupe on (listId, itemAId, itemBId, createdAt
 * within 500ms)". */
const DUPLICATE_WINDOW_MS = 500;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) return jsonError('list not found', 404);

  const rawBody = await parseJsonBody(req);
  const parsed = voteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }
  const { itemAId, itemBId, outcome, strategy, isAudit, latencyMs } = parsed.data;

  const isDuplicate = await recentDuplicateComparison(id, itemAId, itemBId, DUPLICATE_WINDOW_MS);
  if (!isDuplicate) {
    await insertComparison({
      listId: id,
      voterId: DEV_VOTER_ID,
      itemAId,
      itemBId,
      outcome,
      strategy,
      isAudit,
      latencyMs: latencyMs ?? null,
    });
  }

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

  const nextDuel = selectNextDuel({
    items,
    comparisons,
    params: scoringParams,
    capacityItems: list.capacityItems,
    ratings: placedRatings,
    seed: requestSeed(),
  });

  return NextResponse.json({ ratings, status, nextDuel });
}
