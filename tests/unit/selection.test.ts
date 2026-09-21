/**
 * Pair-selection tests (lib/scoring/index.ts: selectNextDuel), against the
 * signature in lib/scoring/contract.ts. Design docs: docs/02 §2 (elicitation
 * strategies), §2.4 (audit), §6 (stop-asking rules).
 */
import { describe, expect, it } from 'vitest';
import { computeRatings, selectNextDuel } from '@/lib/scoring';
import type { Comparison, Outcome } from '@/lib/types';
import { makeComparison, makeItems, testParams } from '@/tests/helpers/factories';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join('::');
}

describe('selectNextDuel', () => {
  it('honours auditFraction roughly, over many draws, on a fresh list', () => {
    // Fresh list: nobody has been compared, so there is always something
    // "worth asking" — this is the common onboarding case (docs/02 §5).
    const items = makeItems(20);
    const comparisons: Comparison[] = [];
    const params = testParams({ auditFraction: 0.1 });
    const ratings = computeRatings({ items, comparisons, params, capacityItems: 8, seed: 1, now: NOW });

    const N = 400;
    let auditCount = 0;
    let nonNull = 0;
    for (let s = 0; s < N; s++) {
      const duel = selectNextDuel({ items, comparisons, params, capacityItems: 8, ratings, seed: s, now: NOW });
      if (duel) {
        nonNull++;
        if (duel.isAudit) auditCount++;
      }
    }

    expect(nonNull).toBeGreaterThan(N * 0.9);
    const frac = auditCount / nonNull;
    // Generous band around the configured 10% — this is a statistical check
    // over 400 draws, not an exact-fraction assertion.
    expect(frac).toBeGreaterThan(0.03);
    expect(frac).toBeLessThan(0.2);
  });

  it('is deterministic given a seed', () => {
    const items = makeItems(10);
    const comparisons = [
      makeComparison({ itemAId: items[0].id, itemBId: items[1].id, outcome: 'a', createdAt: NOW.toISOString() }),
      makeComparison({ itemAId: items[2].id, itemBId: items[3].id, outcome: 'b', createdAt: NOW.toISOString() }),
    ];
    const params = testParams();
    const ratings = computeRatings({ items, comparisons, params, capacityItems: 4, seed: 1, now: NOW });

    const a = selectNextDuel({ items, comparisons, params, capacityItems: 4, ratings, seed: 777, now: NOW });
    const b = selectNextDuel({ items, comparisons, params, capacityItems: 4, ratings, seed: 777, now: NOW });

    expect(b).toEqual(a);
  });

  it('does not repeatedly return an already-settled pair while unresolved pairs exist', () => {
    const items = makeItems(8);
    const [a, b] = items;
    const params = testParams();
    // a vs b just compared, right now — well within one decay half-life.
    const comparisons = [makeComparison({
      itemAId: a.id, itemBId: b.id, outcome: 'a', strategy: 'infogain', createdAt: NOW.toISOString(),
    })];
    const ratings = computeRatings({ items, comparisons, params, capacityItems: 4, seed: 1, now: NOW });

    const settledKey = pairKey(a.id, b.id);
    let totalNonAudit = 0;
    let settledPairPicked = 0;

    for (let s = 0; s < 200; s++) {
      const duel = selectNextDuel({ items, comparisons, params, capacityItems: 4, ratings, seed: s, now: NOW });
      if (!duel || duel.isAudit) continue; // audit sampling is intentionally uniform/unbiased — exempt
      totalNonAudit++;
      if (pairKey(duel.itemA.id, duel.itemB.id) === settledKey) settledPairPicked++;
    }

    expect(totalNonAudit).toBeGreaterThan(0);
    expect(settledPairPicked).toBe(0);
  });

  it('returns null (never a non-audit duel) once the list is confidently, freshly settled', () => {
    // Two well-separated clusters, hammered with a lopsided, consistent,
    // very recent outcome: the cut line sits cleanly between the clusters,
    // so every item should land confidently above or below it — nothing is
    // "worth asking" beyond the audit slice (docs/02 §6).
    const clusterSize = 3;
    const inCluster = makeItems(clusterSize, 'in');
    const outCluster = makeItems(clusterSize, 'out');
    const items = [...inCluster, ...outCluster];

    const comparisons: Comparison[] = [];
    for (const i of inCluster) {
      for (const o of outCluster) {
        for (let k = 0; k < 10; k++) {
          comparisons.push(makeComparison({ itemAId: i.id, itemBId: o.id, outcome: 'a', createdAt: NOW.toISOString() }));
        }
      }
    }

    const params = testParams({ auditFraction: 0.1 });
    const ratings = computeRatings({ items, comparisons, params, capacityItems: clusterSize, seed: 1, now: NOW });

    // Sanity check the scenario really is fully confident before asserting on selection.
    for (const r of ratings) {
      expect(r.pAboveCutline > 0.95 || r.pAboveCutline < 0.05).toBe(true);
    }

    let sawNonAudit = 0;
    let nullPicks = 0;
    const N = 200;
    for (let s = 0; s < N; s++) {
      const duel = selectNextDuel({ items, comparisons, params, capacityItems: clusterSize, ratings, seed: s, now: NOW });
      if (!duel) { nullPicks++; continue; }
      if (!duel.isAudit) sawNonAudit++;
    }

    expect(sawNonAudit).toBe(0);
    expect(nullPicks).toBeGreaterThan(0);
  });
});
