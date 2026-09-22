/**
 * Ratings: point-estimate fit + bootstrap rank intervals (docs/02 §4).
 * Owned by @backend.
 */

import type { ItemId, Rating } from '@/lib/types';
import type { FitInput } from './contract';
import { buildCompArrays, mmFit, argsortDescending } from './fit';
import { mulberry32, fallbackSeed } from './prng';
import { percentileOfSorted } from './math';

export function computeRatingsImpl(
  input: FitInput & { capacityItems: number },
): Rating[] {
  const ca = buildCompArrays(input);
  const { n } = ca;
  if (n === 0) return [];

  const capacity = Math.max(0, Math.min(Math.trunc(input.capacityItems), n));
  const B = Math.max(0, Math.trunc(input.params.bootstrapB));

  // ---- point estimate (also used to warm-start bootstrap convergence) ----
  const thetaPoint = mmFit(
    n,
    ca.priorKappa,
    ca.seedTheta0,
    ca.seedWeight,
    ca.compA,
    ca.compB,
    ca.compWeight,
    ca.compWinA,
  );
  const betaPoint = new Float64Array(n);
  for (let i = 0; i < n; i++) betaPoint[i] = Math.log(thetaPoint[i]);

  const pointOrder = argsortDescending(betaPoint, n);
  const rankOf = new Int32Array(n);
  for (let pos = 0; pos < n; pos++) rankOf[pointOrder[pos]] = pos + 1;

  // ---- bootstrap ----
  const rankMatrix = B > 0 ? new Int32Array(n * B) : new Int32Array(0);
  const aboveCount = new Float64Array(n);
  const betaSum = new Float64Array(n);
  const betaSqSum = new Float64Array(n);

  const M = ca.compA.length;
  if (B > 0) {
    const rng = mulberry32(input.seed ?? fallbackSeed());
    const rA = new Int32Array(M);
    const rB = new Int32Array(M);
    const rW = new Float64Array(M);
    const rWinA = new Float64Array(M);
    // Per-replicate stochastic win/loss split for the prior/seed phantoms
    // (see the big comment on mmFit in fit.ts) — this is what gives a
    // zero-real-comparison item genuine bootstrap variance instead of
    // fitting identically every replicate.
    const priorSplit = new Float64Array(n);
    const seedSplit = new Float64Array(n);
    const betaB = new Float64Array(n); // reused scratch, not re-allocated per replicate

    for (let b = 0; b < B; b++) {
      for (let e = 0; e < M; e++) {
        const src = M > 0 ? Math.floor(rng() * M) : 0;
        rA[e] = ca.compA[src];
        rB[e] = ca.compB[src];
        rW[e] = ca.compWeight[src];
        rWinA[e] = ca.compWinA[src];
      }
      for (let i = 0; i < n; i++) {
        priorSplit[i] = rng();
        seedSplit[i] = rng();
      }
      // Warm-start from the point estimate: a bootstrap replicate is a small
      // perturbation of the same data, so this converges in far fewer
      // iterations than starting cold from theta=1 every time.
      const thetaB = mmFit(n, ca.priorKappa, ca.seedTheta0, ca.seedWeight, rA, rB, rW, rWinA, priorSplit, seedSplit, thetaPoint);

      for (let i = 0; i < n; i++) {
        const lb = Math.log(thetaB[i]);
        betaB[i] = lb;
        betaSum[i] += lb;
        betaSqSum[i] += lb * lb;
      }

      const orderB = argsortDescending(betaB, n);
      for (let pos = 0; pos < n; pos++) {
        const idx = orderB[pos];
        const rank = pos + 1;
        rankMatrix[idx * B + b] = rank;
        if (rank <= capacity) aboveCount[idx] += 1;
      }
    }
  }

  // ---- assemble ratings ----
  const comparisonCount = new Int32Array(n);
  for (const c of input.comparisons) {
    const ai = ca.index.get(c.itemAId);
    const bi = ca.index.get(c.itemBId);
    if (ai !== undefined) comparisonCount[ai] += 1;
    if (bi !== undefined) comparisonCount[bi] += 1;
  }

  const scratch = B > 0 ? new Int32Array(B) : new Int32Array(0);
  const ratings: Rating[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const id: ItemId = ca.ids[i];
    let sigma = 0;
    let rankLo = rankOf[i];
    let rankHi = rankOf[i];
    let pAboveCutline = rankOf[i] <= capacity ? 1 : 0;

    if (B > 0) {
      const mean = betaSum[i] / B;
      const variance = Math.max(0, betaSqSum[i] / B - mean * mean);
      sigma = Math.sqrt(variance);

      for (let b = 0; b < B; b++) scratch[b] = rankMatrix[i * B + b];
      scratch.sort();
      rankLo = percentileOfSorted(scratch, 0.05);
      rankHi = percentileOfSorted(scratch, 0.95);
      pAboveCutline = aboveCount[i] / B;
    }

    const score = n > 1 ? Math.round((100 * (n - rankOf[i])) / (n - 1)) : 100;

    ratings[i] = {
      itemId: id,
      theta: betaPoint[i],
      sigma,
      rank: rankOf[i],
      rankLo,
      rankHi,
      score,
      comparisonCount: comparisonCount[i],
      pAboveCutline,
    };
  }

  ratings.sort((a, b) => a.rank - b.rank);
  return ratings;
}
