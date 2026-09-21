/**
 * Property tests for the scoring engine (lib/scoring/index.ts), written
 * against the fixed signatures in lib/scoring/contract.ts.
 *
 * Design docs: docs/02-ranking-model.md §3 (aggregation), §4 (uncertainty),
 * §6 (confidence). Test list requested explicitly by docs/05-architecture.md
 * "Testing" section.
 *
 * NOTE: lib/scoring/index.ts is owned by @backend and may not exist yet when
 * this file is first collected — that shows up as an import-resolution
 * failure, not a logic failure. See coord/status/qa.md for which is which.
 */
import { describe, expect, it } from 'vitest';
import { computeRatings, fitBradleyTerry } from '@/lib/scoring';
import type { Comparison, Outcome, Rating } from '@/lib/types';
import { makeComparison, makeItems, roundRobin, testParams } from '@/tests/helpers/factories';
import { mulberry32 } from '@/tests/helpers/random';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function orderByRank(ratings: Rating[]): string[] {
  return ratings
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.itemId);
}

describe('fitBradleyTerry / computeRatings — core properties (docs/02 §3-§4)', () => {
  it('a dominant item ranks first', () => {
    const items = makeItems(8);
    const dominant = items[0];
    const rest = items.slice(1);

    const comparisons: Comparison[] = [];
    for (const opp of rest) {
      for (let k = 0; k < 3; k++) {
        comparisons.push(makeComparison({ itemAId: dominant.id, itemBId: opp.id, outcome: 'a', createdAt: NOW.toISOString() }));
      }
    }
    // scramble the rest so the dominant item isn't just "first in a chain"
    const rng = mulberry32(42);
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        comparisons.push(makeComparison({
          itemAId: rest[i].id,
          itemBId: rest[j].id,
          outcome: (rng() < 0.5 ? 'a' : 'b') as Outcome,
          createdAt: NOW.toISOString(),
        }));
      }
    }

    const ratings = computeRatings({ items, comparisons, params: testParams(), capacityItems: 4, seed: 1, now: NOW });
    const top = ratings.find((r) => r.itemId === dominant.id)!;
    expect(top.rank).toBe(1);
    expect(orderByRank(ratings)[0]).toBe(dominant.id);
  });

  it('a reversed comparison log reverses the order', () => {
    const items = makeItems(6);
    const forward: Comparison[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        for (let k = 0; k < 2; k++) {
          forward.push(makeComparison({ itemAId: items[i].id, itemBId: items[j].id, outcome: 'a', createdAt: NOW.toISOString() }));
        }
      }
    }
    const reversed = forward.map((c) => makeComparison({
      ...c,
      outcome: c.outcome === 'a' ? 'b' : c.outcome === 'b' ? 'a' : 'tie',
    }));

    const params = testParams();
    const fwd = computeRatings({ items, comparisons: forward, params, capacityItems: 3, seed: 7, now: NOW });
    const rev = computeRatings({ items, comparisons: reversed, params, capacityItems: 3, seed: 7, now: NOW });

    expect(orderByRank(rev)).toEqual(orderByRank(fwd).slice().reverse());
  });

  it('a log of only ties produces no confident ordering', () => {
    const items = makeItems(6);
    const comparisons: Comparison[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        for (let k = 0; k < 3; k++) {
          comparisons.push(makeComparison({ itemAId: items[i].id, itemBId: items[j].id, outcome: 'tie', createdAt: NOW.toISOString() }));
        }
      }
    }
    const ratings = computeRatings({ items, comparisons, params: testParams(), capacityItems: 3, seed: 3, now: NOW });

    const thetas = ratings.map((r) => r.theta);
    const spread = Math.max(...thetas) - Math.min(...thetas);
    expect(spread).toBeLessThan(0.05);

    // symmetric ties everywhere -> nobody should look confidently in/out of the cut line
    for (const r of ratings) {
      expect(r.pAboveCutline).toBeGreaterThan(0.05);
      expect(r.pAboveCutline).toBeLessThan(0.95);
    }
  });

  it('is deterministic: same input + same seed -> identical output, repeated', () => {
    const items = makeItems(10);
    const rng = mulberry32(99);
    const comparisons = roundRobin(items).map((c) => makeComparison({
      ...c,
      outcome: (rng() < 0.5 ? 'a' : 'b') as Outcome,
      createdAt: NOW.toISOString(),
    }));
    const params = testParams();

    const runs = Array.from({ length: 3 }, () => computeRatings({
      items, comparisons, params, capacityItems: 4, seed: 12345, now: NOW,
    }));
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });

  it('an old comparison influences the fit less than a recent one (decay, docs/02 §3.4)', () => {
    const items = makeItems(2);
    const [a, b] = items;
    const params = testParams({ decayHalflifeDays: 90 });

    const oldDate = new Date(NOW.getTime() - 400 * 24 * 3600 * 1000).toISOString();
    const recentDate = new Date(NOW.getTime() - 1 * 24 * 3600 * 1000).toISOString();

    const thetaOld = fitBradleyTerry({
      items,
      comparisons: [makeComparison({ itemAId: a.id, itemBId: b.id, outcome: 'a', createdAt: oldDate })],
      params,
      now: NOW,
      seed: 1,
    });
    const thetaRecent = fitBradleyTerry({
      items,
      comparisons: [makeComparison({ itemAId: a.id, itemBId: b.id, outcome: 'a', createdAt: recentDate })],
      params,
      now: NOW,
      seed: 1,
    });

    const gapOld = thetaOld.get(a.id)! - thetaOld.get(b.id)!;
    const gapRecent = thetaRecent.get(a.id)! - thetaRecent.get(b.id)!;

    expect(gapOld).toBeGreaterThan(0);
    expect(gapRecent).toBeGreaterThan(gapOld);
  });

  it('rank intervals are sane: rankLo <= rank <= rankHi, all within [1,n], ranks dense and cover every item', () => {
    const items = makeItems(9);
    const rng = mulberry32(7);
    const comparisons = roundRobin(items).map((c) => makeComparison({
      ...c,
      outcome: (rng() < 0.5 ? 'a' : 'b') as Outcome,
      createdAt: NOW.toISOString(),
    }));
    const ratings = computeRatings({ items, comparisons, params: testParams(), capacityItems: 4, seed: 5, now: NOW });

    expect(ratings).toHaveLength(items.length);
    const ranks = ratings.map((r) => r.rank).slice().sort((x, y) => x - y);
    expect(ranks).toEqual(Array.from({ length: items.length }, (_, i) => i + 1));

    for (const r of ratings) {
      expect(r.rankLo).toBeGreaterThanOrEqual(1);
      expect(r.rankHi).toBeLessThanOrEqual(items.length);
      expect(r.rankLo).toBeLessThanOrEqual(r.rank);
      expect(r.rank).toBeLessThanOrEqual(r.rankHi);
    }
  });

  it('comparisons flagged isAudit do not move the fit (docs/02 §2.4)', () => {
    const items = makeItems(6);
    const rng = mulberry32(21);
    const baseline = roundRobin(items).map((c) => makeComparison({
      ...c,
      outcome: (rng() < 0.5 ? 'a' : 'b') as Outcome,
      createdAt: NOW.toISOString(),
    }));
    const params = testParams();

    const thetaBase = fitBradleyTerry({ items, comparisons: baseline, params, now: NOW, seed: 1 });

    // Audit comparisons that would obviously invert the fit if they were counted.
    const auditFlip = baseline.map((c) => makeComparison({
      itemAId: c.itemAId,
      itemBId: c.itemBId,
      outcome: c.outcome === 'a' ? 'b' : c.outcome === 'b' ? 'a' : 'tie',
      isAudit: true,
      strategy: 'audit',
      createdAt: NOW.toISOString(),
    }));

    const thetaWithAudit = fitBradleyTerry({
      items, comparisons: [...baseline, ...auditFlip], params, now: NOW, seed: 1,
    });

    for (const item of items) {
      expect(thetaWithAudit.get(item.id)!).toBeCloseTo(thetaBase.get(item.id)!, 6);
    }
  });
});

describe('finiteness — docs/02 §3.2, "the bug everyone hits"', () => {
  it('an item that has won every comparison has finite theta (never NaN/Infinity)', () => {
    const items = makeItems(5);
    const champ = items[0];
    const comparisons = items.slice(1).map((opp) => makeComparison({
      itemAId: champ.id, itemBId: opp.id, outcome: 'a', createdAt: NOW.toISOString(),
    }));

    const theta = fitBradleyTerry({ items, comparisons, params: testParams(), now: NOW, seed: 1 });

    for (const item of items) {
      const t = theta.get(item.id);
      expect(t).toBeDefined();
      expect(Number.isFinite(t)).toBe(true);
    }
    expect(theta.get(champ.id)!).toBeGreaterThan(0);
  });

  it('an item that has lost every comparison has finite theta (never NaN/-Infinity)', () => {
    const items = makeItems(5);
    const loser = items[0];
    const comparisons = items.slice(1).map((opp) => makeComparison({
      itemAId: loser.id, itemBId: opp.id, outcome: 'b', createdAt: NOW.toISOString(),
    }));

    const theta = fitBradleyTerry({ items, comparisons, params: testParams(), now: NOW, seed: 1 });

    for (const item of items) {
      expect(Number.isFinite(theta.get(item.id))).toBe(true);
    }
    expect(theta.get(loser.id)!).toBeLessThan(0);
  });

  it('an item with zero comparisons comes back at theta ~ 0, not NaN', () => {
    const items = makeItems(5);
    const isolated = items[0];
    const rest = items.slice(1);
    const comparisons = roundRobin(rest); // isolated item never appears in any comparison

    const theta = fitBradleyTerry({ items, comparisons, params: testParams(), now: NOW, seed: 1 });

    const t = theta.get(isolated.id);
    expect(Number.isFinite(t)).toBe(true);
    expect(Math.abs(t!)).toBeLessThan(0.05);
  });

  it('the common case: every item is undefeated/winless/zero-comparisons on first placement', () => {
    // A brand-new list: no comparisons have happened for anyone yet.
    const items = makeItems(4);
    const ratings = computeRatings({ items, comparisons: [], params: testParams(), capacityItems: 2, seed: 1, now: NOW });

    expect(ratings).toHaveLength(4);
    for (const r of ratings) {
      expect(Number.isFinite(r.theta)).toBe(true);
      expect(Number.isFinite(r.sigma)).toBe(true);
      expect(Number.isFinite(r.score)).toBe(true);
      expect(Number.isNaN(r.rank)).toBe(false);
      expect(r.comparisonCount).toBe(0);
      expect(Math.abs(r.theta)).toBeLessThan(0.05);
    }
  });
});
