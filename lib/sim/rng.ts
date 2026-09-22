/**
 * lib/sim/rng.ts — deterministic PRNG + tiny helpers for the simulation
 * harness. Self-contained on purpose:
 *
 *   - lib/scoring/prng.ts has an equivalent mulberry32, but it's an internal
 *     implementation detail of the engine (only lib/scoring/contract.ts is
 *     the frozen, depend-on-me surface — see coord/DASHBOARD.md). Keeping a
 *     separate copy here means the sim never breaks if @backend renames or
 *     reshapes its internals.
 *   - tests/helpers/random.ts has one too, but the sim must not import
 *     across the test boundary (task instructions). Same well-known
 *     algorithm (mulberry32), independently kept here.
 */

export type Rng = () => number;

/** mulberry32: tiny, fast, decent-quality 32-bit PRNG. Same seed -> same
 * stream, forever — this is the entire determinism story for the harness. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic string -> uint32 hash (FNV-1a), used to derive independent
 * sub-seeds from one master seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derive an independent sub-stream seed from a base seed + a salt (string
 * or int). Used so e.g. world generation, voter noise, and per-duel
 * bootstrap/selection seeds never accidentally share a stream even when an
 * experiment reuses one master seed throughout. */
export function subSeed(base: number, salt: number | string): number {
  const s = typeof salt === 'string' ? hashString(salt) : (salt >>> 0);
  return (Math.imul(base ^ s, 2654435761) ^ ((base >>> 3) + (s << 7))) >>> 0;
}

/** Standard normal draw via Box-Muller (cos form). Consumes 2 uniform draws. */
export function gaussian(rng: Rng): number {
  let u1 = rng();
  while (u1 <= 1e-12) u1 = rng(); // avoid log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Fisher-Yates shuffle using a supplied RNG. Does not mutate the input. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
