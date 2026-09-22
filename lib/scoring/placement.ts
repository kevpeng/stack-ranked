/**
 * Placement — binary-insertion probe for a new/unplaced item (docs/02 §2.1).
 * Owned by @backend.
 *
 * Tier -> bucket mapping: Tier has exactly 4 values (now/next/later/never)
 * and nothing in lib/types.ts stores a tier per already-placed item, so the
 * only coherent reading is that Tier is a coarse quartile of the CURRENT
 * ranked list: now = top quarter, next = second quarter, later = third,
 * never = bottom quarter. This is deterministic and needs no extra state.
 *
 * State (the lo/hi search bounds) is not passed in explicitly — it's
 * reconstructed each call by replaying `placementComparisons` (oldest
 * first) against the tier bucket, exactly reproducing where the loop in
 * docs/02 §2.1 would be.
 */

import type { Duel, Item, Rating, Tier } from '@/lib/types';
import type { NextPlacementDuel } from './contract';
import { mulberry32, hashString, fallbackSeed } from './prng';

const TIERS: Tier[] = ['now', 'next', 'later', 'never'];

function jitteredMidpoint(lo: number, hi: number, rng: () => number): number {
  const width = hi - lo;
  const base = lo + width / 2;
  const jitterRange = width * 0.2;
  const jittered = base + (rng() - 0.5) * 2 * jitterRange;
  return Math.min(hi - 1, Math.max(lo, Math.round(jittered)));
}

export const nextPlacementDuelImpl: NextPlacementDuel = (input) => {
  const { item, tier, ranked, items, placementComparisons, params } = input;

  if (placementComparisons.length >= params.maxPlacementTaps) return null;

  const sortedRanked = [...ranked]
    .filter((r) => r.itemId !== item.id)
    .sort((a, b) => a.rank - b.rank);
  const n = sortedRanked.length;
  if (n === 0) return null;

  const tierIdx = Math.max(0, TIERS.indexOf(tier));
  const bucketSize = Math.ceil(n / 4);
  const bucketStart = Math.min(tierIdx * bucketSize, n);
  const bucketEnd = Math.min(bucketStart + bucketSize, n);
  const bucket: Rating[] = sortedRanked.slice(bucketStart, bucketEnd);
  const bucketLen = bucket.length;
  if (bucketLen === 0) return null;

  const bucketIndexById = new Map(bucket.map((r, idx) => [r.itemId, idx]));

  let lo = 0;
  let hi = bucketLen;
  for (const cmp of placementComparisons) {
    const oppId = cmp.itemAId === item.id ? cmp.itemBId : cmp.itemAId;
    const oppIdx = bucketIndexById.get(oppId);
    if (oppIdx === undefined) continue; // opponent wasn't from this bucket; ignore defensively

    const itemWon = (cmp.outcome === 'a' && cmp.itemAId === item.id)
      || (cmp.outcome === 'b' && cmp.itemBId === item.id);

    if (cmp.outcome === 'tie') {
      lo = Math.max(lo, oppIdx);
      hi = Math.min(hi, oppIdx + 1);
    } else if (itemWon) {
      hi = Math.min(hi, oppIdx);
    } else {
      lo = Math.max(lo, oppIdx + 1);
    }
    if (lo > hi) { lo = hi; } // guard against contradictory replayed taps
  }

  if (hi - lo <= 1) return null; // converged (or too few items in this tier to refine further)

  const seedBase = (input.seed ?? fallbackSeed()) ^ hashString(item.id) ^ (placementComparisons.length * 2654435761);
  const rng = mulberry32(seedBase >>> 0);
  const mid = jitteredMidpoint(lo, hi, rng);
  const opponentRating = bucket[mid];
  if (!opponentRating) return null;

  const itemById = new Map<string, Item>(items.map((it) => [it.id, it]));
  const opponent = itemById.get(opponentRating.itemId);
  if (!opponent) return null;

  const swap = rng() < 0.5;
  const duel: Duel = {
    itemA: swap ? opponent : item,
    itemB: swap ? item : opponent,
    strategy: 'placement',
    isAudit: false,
  };
  return duel;
};

// Re-exported only for tests that want to exercise the tier/bucket math in
// isolation without going through the full duel-selection flow.
export function tierBucketBounds(tier: Tier, n: number): { start: number; end: number } {
  const tierIdx = Math.max(0, TIERS.indexOf(tier));
  const bucketSize = Math.ceil(n / 4);
  const start = Math.min(tierIdx * bucketSize, n);
  const end = Math.min(start + bucketSize, n);
  return { start, end };
}
