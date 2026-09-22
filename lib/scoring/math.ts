/**
 * Small math helpers — owned by @backend. No I/O, no randomness.
 */

const SQRT2 = Math.SQRT2;

/** Abramowitz & Stegun 7.1.26 approximation, max error ~1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF Φ(x). Used by pair-selection's outcome-probability model (docs/02 §2.2). */
export function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / SQRT2));
}

/** Logistic sigmoid. This is the actual Bradley-Terry link (docs/02 §3.1: P(i beats j) = σ(βi − βj)). */
export function logisticP(betaA: number, betaB: number): number {
  return 1 / (1 + Math.exp(-(betaA - betaB)));
}

/** Binary entropy in bits, guarded against log(0). Peaks at p=0.5 (=1 bit). */
export function binaryEntropy(p: number): number {
  const eps = 1e-9;
  const q = Math.min(1 - eps, Math.max(eps, p));
  return -(q * Math.log2(q) + (1 - q) * Math.log2(1 - q));
}

/** Nearest-rank percentile of a value already sorted ascending. p in [0,1]. */
export function percentileOfSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const idx = Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))));
  return sorted[idx];
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
