/**
 * Deterministic PRNG — owned by @backend.
 *
 * The engine must never call bare `Math.random()` (coord instructions):
 * bootstrap resampling and pair-selection sampling both need to be
 * reproducible given `FitInput.seed`. mulberry32 is a tiny, fast, decent-
 * quality 32-bit PRNG — good enough for resampling/jitter, not for anything
 * security-sensitive (never used for that here).
 */

export type Rng = () => number;

/** Returns a function producing floats in [0, 1). Same seed -> same stream. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap deterministic string hash (FNV-1a-ish), used to mix ids into seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seed is always required internally; this is the single fallback point
 * (used only when the caller omits FitInput.seed / NextPlacementDuel.seed).
 * Deliberately NOT Math.random() — Date.now() varies run to run without
 * touching a nondeterministic RNG API, and every downstream draw still goes
 * through mulberry32. */
export function fallbackSeed(): number {
  return Date.now() >>> 0;
}
