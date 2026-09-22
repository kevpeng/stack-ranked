/**
 * Bradley-Terry fit core — owned by @backend. Pure, allocation-light,
 * typed-array based. Implements docs/02 §3 (model + regularization + decay)
 * and the cold-start seed prior from §5.
 *
 * Design (see coord/status/backend.md for the full rationale):
 *
 * Every item i gets TWO fixed ("phantom") comparison partners that never
 * update, so the comparison graph is always fully connected and the MAP
 * always exists and is finite:
 *   - regularization phantom, theta = 1, weight = params.priorKappa (§3.2)
 *   - seed phantom, theta = theta0_i derived from seedOrder position,
 *     weight = SEED_KAPPA (weak, §5) — only for items present in seedOrder
 *
 * Real comparisons are kept as flat typed arrays (one entry per comparison,
 * no pair-deduplication needed — the MM sum is linear in edge weight, so
 * duplicate (i,j) entries are mathematically equivalent to one aggregated
 * entry). This lets bootstrap resampling just gather-index into these
 * arrays with zero re-parsing of dates/ids per replicate.
 */

import type { Comparison, Item, ItemId, ScoringParams, Outcome } from '@/lib/types';
import type { FitInput } from './contract';

/** Weak prior strength for the cold-start seed order (docs/02 §5: "κ ≈ 1").
 * Intentionally NOT part of ScoringParams (contract.ts is frozen) — this is
 * an internal implementation constant, tuned so ~5 real comparisons (each
 * full weight 1) overwhelm it. */
const SEED_KAPPA = 1.0;

/** Total log-theta spread applied across a full seed order, best to worst.
 * exp(SEED_SPREAD) ≈ 12x theta ratio top-to-bottom — a mild, defensible
 * starting order, easily overturned by real data. */
const SEED_SPREAD = 2.5;

const MS_PER_DAY = 86_400_000;

export interface CompArrays {
  n: number;
  ids: ItemId[];
  index: Map<ItemId, number>;
  /** One entry per included (non-audit, both-endpoints-known) comparison. */
  compA: Int32Array;
  compB: Int32Array;
  /** Decayed weight (0.5^(ageDays/halflife)). */
  compWeight: Float64Array;
  /** Fraction of compWeight[i] that counts as a win for compA[i]: 1, 0.5 (tie), or 0. */
  compWinA: Float64Array;
  priorKappa: number;
  seedTheta0: Float64Array;
  seedWeight: Float64Array;
}

export function decayWeight(createdAt: string, now: Date, halflifeDays: number): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / MS_PER_DAY);
  const hl = halflifeDays > 0 ? halflifeDays : 1e-9;
  return Math.pow(0.5, ageDays / hl);
}

function winFractionA(outcome: Outcome): number {
  if (outcome === 'a') return 1;
  if (outcome === 'b') return 0;
  return 0.5;
}

function buildSeedArrays(
  items: Item[],
  index: Map<ItemId, number>,
  seedOrder: ItemId[] | undefined,
  n: number,
): { theta0: Float64Array; weight: Float64Array } {
  const theta0 = new Float64Array(n).fill(1);
  const weight = new Float64Array(n).fill(0);
  if (!seedOrder || seedOrder.length === 0) return { theta0, weight };

  const m = seedOrder.length;
  for (let rank = 0; rank < m; rank++) {
    const idx = index.get(seedOrder[rank]);
    if (idx === undefined) continue; // seedOrder may reference an item not in `items` (defensive)
    const z = m > 1 ? ((m - 1) / 2 - rank) / (m - 1) : 0; // in [-0.5, 0.5], best item = +0.5
    theta0[idx] = Math.exp(z * SEED_SPREAD);
    weight[idx] = SEED_KAPPA;
  }
  return { theta0, weight };
}

/** Builds the fit problem once per call. isAudit comparisons are EXCLUDED
 * here (docs/02 §2.4 — the audit set must never influence the fit it's
 * meant to evaluate). */
export function buildCompArrays(input: FitInput): CompArrays {
  const { items, comparisons, params, seedOrder } = input;
  const now = input.now ?? new Date();

  const n = items.length;
  const ids = items.map((it) => it.id);
  const index = new Map<ItemId, number>();
  for (let i = 0; i < n; i++) index.set(ids[i], i);

  const compA: number[] = [];
  const compB: number[] = [];
  const compWeight: number[] = [];
  const compWinA: number[] = [];

  for (const c of comparisons) {
    if (c.isAudit) continue;
    const ai = index.get(c.itemAId);
    const bi = index.get(c.itemBId);
    if (ai === undefined || bi === undefined || ai === bi) continue;
    const w = decayWeight(c.createdAt, now, params.decayHalflifeDays);
    if (w <= 0) continue;
    compA.push(ai);
    compB.push(bi);
    compWeight.push(w);
    compWinA.push(winFractionA(c.outcome));
  }

  const { theta0, weight } = buildSeedArrays(items, index, seedOrder, n);

  return {
    n,
    ids,
    index,
    compA: Int32Array.from(compA),
    compB: Int32Array.from(compB),
    compWeight: Float64Array.from(compWeight),
    compWinA: Float64Array.from(compWinA),
    priorKappa: params.priorKappa,
    seedTheta0: theta0,
    seedWeight: weight,
  };
}

/**
 * Hunter's MM algorithm (docs/02 §3.1) with fixed phantom regularization
 * partners folded directly into W/denom. Reusable buffers passed in by the
 * caller avoid per-call allocation when run B times for the bootstrap.
 *
 * edgeA/edgeB/edgeWeight/edgeWinA may be a resampled VIEW into a larger
 * array (bootstrap) or the full base arrays (point-estimate fit) — same
 * shapes as CompArrays' compA/compB/compWeight/compWinA.
 *
 * priorSplit/seedSplit: per-item win-fraction the regularization/seed
 * phantom awards to that item on THIS fit, in [0, 1]. Default 0.5 for
 * both — the exact symmetric MAP prior (docs/02 §3.2), used for the
 * point-estimate fit. The bootstrap (bootstrap.ts) draws these randomly
 * per replicate instead of holding them at the fixed 0.5 split.
 *
 * Why: the phantom's DENOMINATOR term (priorKappa/(theta+1), and the
 * analogous seed term) is independent of the split and always > 0, so the
 * fixed point is finite for any split in [0, 1] — varying only the
 * numerator split is always safe (no divergence risk) while still
 * injecting genuine per-item randomness. Without this, an item with zero
 * real comparisons is fit IDENTICALLY on every bootstrap replicate (there
 * is nothing in the real comparison log to resample), so its bootstrap
 * rank distribution — and therefore sigma and pAboveCutline — collapses
 * to a single point. That is wrong: a zero-evidence item's true rank is
 * genuinely uncertain, bounded mainly by the weak prior, not by data. This
 * is what actually reflects that uncertainty in the bootstrap distribution
 * docs/02 §4 is built on.
 */
export function mmFit(
  n: number,
  priorKappa: number,
  seedTheta0: Float64Array,
  seedWeight: Float64Array,
  edgeA: Int32Array,
  edgeB: Int32Array,
  edgeWeight: Float64Array,
  edgeWinA: Float64Array,
  priorSplit: Float64Array | null = null,
  seedSplit: Float64Array | null = null,
  /** Warm start (e.g. the point-estimate theta, for a bootstrap replicate
   * that perturbs the same underlying data) — converges in far fewer
   * iterations than starting from theta=1 every time. Copied, never
   * mutated. */
  initTheta: Float64Array | null = null,
  /** maxIters/eps are tuned for RANK quality per second of wall clock, not
   * decimal precision of theta: on a 300-item/2000-comparison sparse random
   * graph, tightening to eps=1e-5 (maxIters~60-90) changes Kendall's tau
   * against a fully-converged reference fit by <0.001 versus these looser
   * defaults, while costing 2-3x the iterations — all in noise the
   * bootstrap CI is meant to represent anyway. Measured, not guessed: see
   * coord/status/backend.md. */
  maxIters = 25,
  eps = 5e-3,
): Float64Array {
  if (n === 0) return new Float64Array(0);
  const m = edgeA.length;

  const W = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ps = priorSplit ? priorSplit[i] : 0.5;
    const ss = seedSplit ? seedSplit[i] : 0.5;
    W[i] = priorKappa * ps + (seedWeight[i] > 0 ? seedWeight[i] * ss : 0);
  }
  for (let e = 0; e < m; e++) {
    const i = edgeA[e];
    const j = edgeB[e];
    const w = edgeWeight[e];
    const wa = edgeWinA[e];
    W[i] += wa * w;
    W[j] += (1 - wa) * w;
  }

  const theta = new Float64Array(n);
  const logTheta = new Float64Array(n);
  if (initTheta) {
    for (let i = 0; i < n; i++) {
      const t = initTheta[i] > 0 && Number.isFinite(initTheta[i]) ? initTheta[i] : 1;
      theta[i] = t;
      logTheta[i] = Math.log(t);
    }
  } else {
    theta.fill(1); // logTheta already zero-filled, matching ln(1) = 0
  }
  const denom = new Float64Array(n);
  const newLogTheta = new Float64Array(n);

  for (let iter = 0; iter < maxIters; iter++) {
    denom.fill(0);
    for (let i = 0; i < n; i++) {
      denom[i] += priorKappa / (theta[i] + 1);
      if (seedWeight[i] > 0) denom[i] += seedWeight[i] / (theta[i] + seedTheta0[i]);
    }
    for (let e = 0; e < m; e++) {
      const i = edgeA[e];
      const j = edgeB[e];
      const d = edgeWeight[e] / (theta[i] + theta[j]);
      denom[i] += d;
      denom[j] += d;
    }

    // One log() per item to move into log-space; everything downstream
    // (centering, delta) stays in log-space with no further log()/exp()
    // until we need raw theta back for next iteration's edge terms.
    let logSum = 0;
    for (let i = 0; i < n; i++) {
      let t = denom[i] > 0 ? W[i] / denom[i] : theta[i];
      if (!Number.isFinite(t) || t <= 0) t = 1e-9;
      const lt = Math.log(t);
      newLogTheta[i] = lt;
      logSum += lt;
    }
    const shift = logSum / n;

    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const centeredLog = newLogTheta[i] - shift;
      const delta = Math.abs(centeredLog - logTheta[i]);
      if (delta > maxDelta) maxDelta = delta;
      logTheta[i] = centeredLog;
      theta[i] = Math.exp(centeredLog);
    }
    if (maxDelta < eps) break;
  }

  return theta;
}

/** Stable descending sort of indices [0, n) by value, ties broken by index
 * (deterministic — never relies on JS engine sort stability guarantees
 * beyond what's specified, though modern engines are stable anyway). */
export function argsortDescending(values: ArrayLike<number>, n: number): Int32Array {
  const idxs: number[] = new Array(n);
  for (let i = 0; i < n; i++) idxs[i] = i;
  idxs.sort((a, b) => values[b] - values[a] || a - b);
  return Int32Array.from(idxs);
}
