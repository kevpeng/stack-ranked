/**
 * lib/sim/world.ts — synthetic backlog generator with known ground truth.
 *
 * Produces `Item`-compatible records (drives lib/scoring/contract.ts's
 * `FitInput.items` directly — WorldItem structurally satisfies `Item`) plus
 * a hidden `trueTheta`/`trueRank` the scoring engine never sees. Evaluation
 * code (lib/sim/run.ts) compares fitted rank back against these.
 *
 * `trueTheta` is on the SAME scale as `Rating.theta` / `fitBradleyTerry`'s
 * output (log-scale beta, docs/02 §3.1's beta_i = ln(theta_i)) — i.e. it's
 * directly comparable to what the engine fits, and the synthetic voter
 * (lib/sim/voter.ts) reads it straight off these items. That is what makes
 * "rank recovery" a meaningful measurement rather than an apples-to-oranges
 * one.
 */

import type { Item, ItemId, ItemState } from '../types';
import { makeRng, gaussian, subSeed, shuffle } from './rng';

export interface WorldItem extends Item {
  /** Ground-truth latent strength, log scale. Hidden from the engine. */
  trueTheta: number;
  /** 1-indexed true rank, 1 = best (highest trueTheta). */
  trueRank: number;
}

export interface WorldConfig {
  n: number;
  seed: number;
  /**
   * Std-dev of the i.i.d. Normal(0, thetaSpread) draw for trueTheta.
   * Default 1.0: with n in the 60-300 range this typically puts the
   * best/worst items ~4.5-6 apart (log-odds), an e^4.5..e^6 ~ 90-400x theta
   * ratio top-to-bottom for the extremes, tapering to a much tighter gap
   * near the cut line where the interesting decisions actually live —
   * deliberately not a uniform ladder, so most pairs are genuinely hard,
   * same as a real backlog.
   */
  thetaSpread?: number;
  /**
   * Optional label pool. When given, each item independently gets 0-2
   * labels drawn from it. Leave undefined (default) for the core
   * convergence experiments so `comparability`
   * (lib/scoring/selection.ts) stays a flat constant across all pairs and
   * doesn't confound the measurement.
   */
  labelPool?: string[];
}

const MS_PER_DAY = 86_400_000;
// Fixed reference instant so world generation is 100% deterministic
// regardless of wall-clock time. createdAtExternal is display-only and
// never read by scoring, but there's no reason to let it float either.
const REFERENCE_NOW = Date.parse('2026-09-22T00:00:00.000Z');

export function generateWorld(config: WorldConfig): WorldItem[] {
  const { n } = config;
  const thetaSpread = config.thetaSpread ?? 1.0;
  const thetaRng = makeRng(subSeed(config.seed, 'world-theta'));
  const miscRng = makeRng(subSeed(config.seed, 'world-misc'));

  const thetas: number[] = [];
  for (let i = 0; i < n; i++) thetas.push(gaussian(thetaRng) * thetaSpread);

  const rankOrder = thetas
    .map((theta, i) => ({ i, theta }))
    .sort((a, b) => b.theta - a.theta);
  const trueRank = new Array<number>(n);
  rankOrder.forEach(({ i }, pos) => { trueRank[i] = pos + 1; });

  const labelPool = config.labelPool ?? [];

  const items: WorldItem[] = [];
  for (let i = 0; i < n; i++) {
    const labels: string[] = [];
    if (labelPool.length > 0) {
      const count = Math.floor(miscRng() * 3); // 0, 1 or 2 labels
      const shuffled = shuffle(labelPool, miscRng);
      for (let j = 0; j < Math.min(count, shuffled.length); j++) labels.push(shuffled[j]);
    }
    const ageDays = Math.floor(miscRng() * 400);
    items.push({
      id: `sim-${i}` as ItemId,
      externalKey: `SIM-${i + 1}`,
      title: `Synthetic item ${i + 1}`,
      summaryLine: `Synthetic item ${i + 1}`,
      labels,
      estimate: null,
      state: 'active' as ItemState,
      evidence: {},
      createdAtExternal: new Date(REFERENCE_NOW - ageDays * MS_PER_DAY).toISOString(),
      externalPriority: null,
      externalSortOrder: null,
      trueTheta: thetas[i],
      trueRank: trueRank[i],
    });
  }
  return items;
}

export function trueRankMap(world: readonly WorldItem[]): Map<ItemId, number> {
  return new Map(world.map((it) => [it.id, it.trueRank]));
}
