/**
 * Recovery test: the engine's real job is not just "doesn't crash" but
 * "recovers the true order from noisy single-voter judgments" (docs/02 §3,
 * §7 "Validation"). Simulate a known ground-truth strength order, feed in
 * comparisons from a voter who is right ~85% of the time (docs/03: "one
 * person is self-consistent (~85-90%)"), and check the fitted ranking
 * correlates strongly with ground truth via Spearman's rho.
 */
import { describe, expect, it } from 'vitest';
import { computeRatings } from '@/lib/scoring';
import type { Comparison, Outcome } from '@/lib/types';
import { makeComparison, makeItems, testParams } from '@/tests/helpers/factories';
import { mulberry32, spearman } from '@/tests/helpers/random';

const NOW = new Date('2026-06-01T00:00:00.000Z');

describe('scoring engine recovers a known ground truth from a noisy voter', () => {
  it('fitted rank correlates strongly (Spearman rho > 0.8) with ground truth at ~85% voter accuracy', () => {
    const n = 16;
    const items = makeItems(n);
    // ground truth strength strictly increasing with index: item[n-1] is best.
    const trueStrength = items.map((_, i) => i);
    const trueRankOf = (idx: number) => n - idx; // item[n-1] -> rank 1

    const rng = mulberry32(2024);
    const ACCURACY = 0.85;
    const comparisons: Comparison[] = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let rep = 0; rep < 2; rep++) {
          const jIsTrueWinner = trueStrength[j] > trueStrength[i];
          const voterCorrect = rng() < ACCURACY;
          const jWins = voterCorrect ? jIsTrueWinner : !jIsTrueWinner;
          comparisons.push(makeComparison({
            itemAId: items[i].id,
            itemBId: items[j].id,
            outcome: (jWins ? 'b' : 'a') as Outcome,
            strategy: 'infogain',
            createdAt: NOW.toISOString(),
          }));
        }
      }
    }

    const ratings = computeRatings({
      items, comparisons, params: testParams(), capacityItems: Math.floor(n / 2), seed: 55, now: NOW,
    });

    const fittedRank = items.map((item) => ratings.find((r) => r.itemId === item.id)!.rank);
    const trueRank = items.map((_, i) => trueRankOf(i));

    const rho = spearman(fittedRank, trueRank);
    expect(rho).toBeGreaterThan(0.8);
  });
});
