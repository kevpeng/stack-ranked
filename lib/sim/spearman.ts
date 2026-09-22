/**
 * lib/sim/spearman.ts — Spearman rank correlation, used to score fitted
 * ranking against the simulation's known ground truth (docs/02 §7).
 *
 * tests/helpers/random.ts has an equivalent implementation. Kept as an
 * independent copy here on purpose — the sim must not import across the
 * test boundary (task instructions). Same standard algorithm (average-rank
 * ties, Pearson on the rank vectors), authored separately.
 */

export function spearman(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('spearman: length mismatch');
  if (a.length === 0) return 1;
  return pearson(rankOf(a), rankOf(b));
}

function rankOf(values: readonly number[]): number[] {
  const idx = values.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j) / 2 + 1; // average rank for ties, 1-indexed
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return 0;
  return num / Math.sqrt(denA * denB);
}
