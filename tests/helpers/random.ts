/**
 * Small seeded-random + statistics helpers for QA property tests.
 *
 * No fast-check / simple-statistics in node_modules (see coord/status/qa.md —
 * we were told never to `npm install`), so these are hand-rolled and kept
 * deliberately tiny. Pure functions, no dependency on anything under test.
 */

/** Deterministic PRNG (mulberry32). Same seed -> same sequence, always. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using a supplied RNG (does not mutate input). */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Spearman rank correlation between two equal-length numeric arrays. */
export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('spearman: length mismatch');
  const ra = rankOf(a);
  const rb = rankOf(b);
  return pearson(ra, rb);
}

function rankOf(values: number[]): number[] {
  const idx = values.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const ranks = new Array(values.length).fill(0);
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

function pearson(a: number[], b: number[]): number {
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
