/**
 * Pair selection for maintenance duels (docs/02 §2.2-§2.4). Owned by
 * @backend.
 */

import type { Comparison, Duel, Item, ItemId, Rating } from '@/lib/types';
import type { FitInput } from './contract';
import { mulberry32, fallbackSeed, type Rng } from './prng';
import { normalCDF, binaryEntropy, clamp } from './math';
import { decayWeight } from './fit';

interface Candidate {
  i: number;
  j: number;
  /** Full value formula (docs/02 §2.2), independent of the recency gate. */
  rawValue: number;
  recentlyCompared: boolean;
  relevance: number;
}

function pairKey(a: ItemId, b: ItemId): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/** Most recent comparison timestamp (any strategy) for every unordered pair
 * that has ever been compared. Built once per call. */
function buildLastCompared(comparisons: Comparison[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const c of comparisons) {
    const key = pairKey(c.itemAId, c.itemBId);
    const t = new Date(c.createdAt).getTime();
    const prev = last.get(key);
    if (prev === undefined || t > prev) last.set(key, t);
  }
  return last;
}

function relevanceOf(p: number): number {
  return 1 - Math.abs(2 * p - 1);
}

function comparabilityOf(a: Item, b: Item): number {
  if (a.labels.length === 0 || b.labels.length === 0) return 0.85;
  const shared = a.labels.some((l) => b.labels.includes(l));
  return shared ? 1.0 : 0.4;
}

function pickWeighted(cands: Candidate[], rng: Rng): Candidate {
  const total = cands.reduce((s, c) => s + c.rawValue, 0);
  if (total <= 0) return cands[Math.floor(rng() * cands.length)] ?? cands[0];
  let r = rng() * total;
  for (const c of cands) {
    r -= c.rawValue;
    if (r <= 0) return c;
  }
  return cands[cands.length - 1];
}

const VALUE_EPS = 1e-6;
const TOP_K_MIN = 10;
const TOP_K_FRACTION = 0.05;

export function selectNextDuelImpl(
  input: FitInput & { capacityItems: number; ratings: Rating[] },
): Duel | null {
  const { items, comparisons, params, ratings } = input;
  const now = input.now ?? new Date();
  const rng = mulberry32(input.seed ?? fallbackSeed());

  const itemById = new Map(items.map((it) => [it.id, it]));
  const ratingById = new Map(ratings.map((r) => [r.itemId, r]));

  const activeIds = ratings
    .map((r) => r.itemId)
    .filter((id) => itemById.get(id)?.state === 'active');

  if (activeIds.length < 2) return null;

  const lastCompared = buildLastCompared(comparisons);
  const isRecentlyCompared = (aId: ItemId, bId: ItemId): boolean => {
    const t = lastCompared.get(pairKey(aId, bId));
    if (t === undefined) return false;
    const ageDays = (now.getTime() - t) / 86_400_000;
    return ageDays < params.decayHalflifeDays;
  };

  const makeDuel = (aId: ItemId, bId: ItemId, strategy: Duel['strategy'], isAudit: boolean): Duel | null => {
    const itemA = itemById.get(aId);
    const itemB = itemById.get(bId);
    if (!itemA || !itemB) return null;
    const swap = rng() < 0.5;
    return {
      itemA: swap ? itemB : itemA,
      itemB: swap ? itemA : itemB,
      strategy,
      isAudit,
    };
  };

  // ---- audit draw: honour auditFraction with a uniformly random pair ----
  if (rng() < clamp(params.auditFraction, 0, 1)) {
    const withoutRecent: [ItemId, ItemId][] = [];
    const all: [ItemId, ItemId][] = [];
    for (let a = 0; a < activeIds.length; a++) {
      for (let b = a + 1; b < activeIds.length; b++) {
        const pair: [ItemId, ItemId] = [activeIds[a], activeIds[b]];
        all.push(pair);
        if (!isRecentlyCompared(pair[0], pair[1])) withoutRecent.push(pair);
      }
    }
    const pool = withoutRecent.length > 0 ? withoutRecent : all;
    if (pool.length === 0) return null;
    const [aId, bId] = pool[Math.floor(rng() * pool.length)];
    return makeDuel(aId, bId, 'audit', true);
  }

  // ---- infogain / cutline: score every candidate pair ----
  const candidates: Candidate[] = [];
  for (let a = 0; a < activeIds.length; a++) {
    const aId = activeIds[a];
    const ra = ratingById.get(aId);
    if (!ra) continue;
    const itemA = itemById.get(aId)!;
    for (let b = a + 1; b < activeIds.length; b++) {
      const bId = activeIds[b];
      const rb = ratingById.get(bId);
      if (!rb) continue;
      const itemB = itemById.get(bId)!;

      const recently = isRecentlyCompared(aId, bId);

      const denomSpread = Math.sqrt(2 * params.noiseBeta * params.noiseBeta + ra.sigma * ra.sigma + rb.sigma * rb.sigma);
      const p = denomSpread > 0 ? normalCDF((ra.theta - rb.theta) / denomSpread) : (ra.theta > rb.theta ? 1 : ra.theta < rb.theta ? 0 : 0.5);
      const entropy = binaryEntropy(p);
      const uncertainty = ra.sigma * ra.sigma + rb.sigma * rb.sigma;
      const relevance = Math.max(relevanceOf(ra.pAboveCutline), relevanceOf(rb.pAboveCutline));

      const lastT = lastCompared.get(pairKey(aId, bId));
      const staleness = lastT === undefined
        ? 1
        : 1 - decayWeight(new Date(lastT).toISOString(), now, params.decayHalflifeDays);

      const comparability = comparabilityOf(itemA, itemB);

      const value = entropy * uncertainty * relevance * staleness * comparability;
      candidates.push({ i: a, j: b, rawValue: value, recentlyCompared: recently, relevance });
    }
  }

  if (candidates.length === 0) return null;

  const notRecent = candidates.filter((c) => !c.recentlyCompared);
  // "unless nothing else is available" — only fall back to recently-compared
  // pairs when every candidate has been asked within one half-life.
  const pool = notRecent.length > 0 ? notRecent : candidates;

  pool.sort((x, y) => y.rawValue - x.rawValue);
  const maxValue = pool[0]?.rawValue ?? 0;
  if (maxValue < VALUE_EPS) return null; // nothing worth asking (docs/02 §6)

  const k = Math.max(TOP_K_MIN, Math.ceil(pool.length * TOP_K_FRACTION));
  const top = pool.slice(0, Math.min(k, pool.length));
  const chosen = pickWeighted(top, rng);

  const strategy: Duel['strategy'] = chosen.relevance >= 0.5 ? 'cutline' : 'infogain';
  return makeDuel(activeIds[chosen.i], activeIds[chosen.j], strategy, false);
}
