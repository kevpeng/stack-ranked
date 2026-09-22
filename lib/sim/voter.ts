/**
 * lib/sim/voter.ts — synthetic voter for the simulation harness.
 *
 * Self-contained: imports only the shared `Outcome` type from lib/types
 * (read-only contract). Deterministic given a seed and a fixed call
 * sequence — same seed, same sequence of `.vote()` calls, byte-identical
 * outcomes every time.
 *
 * Response model (docs/02 §1, §3.3, §7; docs/03 "the one real integrity
 * concern: fatigue"):
 *
 *   1. `tieRate` fires first: with that probability the voter declares a
 *      tie regardless of the gap, independent of accuracy/fatigue.
 *   2. Otherwise the voter picks the truly-better item — "truly better"
 *      meaning higher `trueTheta`, or higher PERCEIVED theta if `bias` is
 *      configured (see below) — with probability `accuracy` (adjusted for
 *      fatigue), and the worse one with probability `1 - accuracy`.
 *
 * This is a deliberately FLAT accuracy model: P(correct) does not depend on
 * how close the pair's true thetas are. That is not an oversight — making
 * it gap-dependent (e.g. routing it through the engine's own logistic link)
 * would double-count with `noiseBeta`, which already models comparison
 * difficulty from the FIT's point of view. Here `accuracy` is meant to be
 * exactly what docs/02 §1 defines: "a single person is ~85-90%
 * self-consistent" — a flat, literal self-consistency rate, independent of
 * the pair.
 *
 * `bias` is a different failure mode than noise: a systematic distortion
 * where items carrying a given label get a fixed perceived-theta boost, so
 * the voter is internally consistent (their own `accuracy` still governs
 * noise around their own belief) but their belief itself is skewed away
 * from ground truth. It is scored separately (fitted rank vs TRUE rank,
 * not vs the voter's biased belief).
 */

import type { Outcome } from '../types';
import { makeRng, type Rng } from './rng';

export interface VoterItem {
  id: string;
  /** Ground-truth latent strength, log scale — same units as Rating.theta
   * (docs/02 §3.1's beta = ln(theta); see lib/sim/world.ts). */
  trueTheta: number;
  labels: string[];
}

export interface FatigueConfig {
  /** Taps into the session before fatigue starts biting. Docs/03: "real
   * people get worse after 100 taps." */
  onsetTap: number;
  /** Taps of further decay for the (accuracy - floor) margin to halve. */
  halfLifeTaps: number;
  /** Accuracy floor at full fatigue (0.5 = pure chance). */
  floorAccuracy: number;
}

export interface BiasConfig {
  /** Item label this voter systematically over-rates. */
  label: string;
  /** Additive perceived-theta boost (log-odds units) for items with that label. */
  strength: number;
}

export interface VoterConfig {
  /** Required. Same seed + same call sequence => byte-identical votes. */
  seed: number;
  /** P(picks the truly-better item), pre-fatigue. Docs/02 §1: ~0.87. */
  accuracy?: number;
  /** P(declares a tie), independent of the gap. Docs/02 §3.3. */
  tieRate?: number;
  /** Accuracy decay through a long session. Omit for a constant-accuracy voter. */
  fatigue?: FatigueConfig;
  /** Systematic label over-rating. Omit for an unbiased voter. */
  bias?: BiasConfig;
}

export interface VoteRequest {
  itemA: VoterItem;
  itemB: VoterItem;
  /** 1-indexed position of this duel within the session, for fatigue. Pass
   * a constant (e.g. 1) to disable fatigue's effect even if configured. */
  tapIndexInSession: number;
}

export interface SyntheticVoter {
  vote(req: VoteRequest): Outcome;
  /** Effective accuracy at a given tap index, after fatigue. Exposed for
   * reporting/plotting; not needed to drive votes. */
  effectiveAccuracyAt(tapIndexInSession: number): number;
}

export const DEFAULT_ACCURACY = 0.87;

export function createSyntheticVoter(config: VoterConfig): SyntheticVoter {
  const baseAccuracy = config.accuracy ?? DEFAULT_ACCURACY;
  const tieRate = config.tieRate ?? 0;
  const { fatigue, bias } = config;
  const rng: Rng = makeRng(config.seed >>> 0);

  function effectiveAccuracyAt(tapIndex: number): number {
    if (!fatigue) return baseAccuracy;
    const { onsetTap, halfLifeTaps, floorAccuracy } = fatigue;
    if (tapIndex <= onsetTap) return baseAccuracy;
    const hl = Math.max(1e-9, halfLifeTaps);
    const decay = Math.pow(0.5, (tapIndex - onsetTap) / hl);
    return floorAccuracy + (baseAccuracy - floorAccuracy) * decay;
  }

  function perceivedTheta(item: VoterItem): number {
    if (bias && item.labels.includes(bias.label)) return item.trueTheta + bias.strength;
    return item.trueTheta;
  }

  function vote(req: VoteRequest): Outcome {
    if (tieRate > 0 && rng() < tieRate) return 'tie';

    const pa = perceivedTheta(req.itemA);
    const pb = perceivedTheta(req.itemB);
    const trulyBetterIsA = pa >= pb;

    const acc = effectiveAccuracyAt(req.tapIndexInSession);
    const picksTrulyBetter = rng() < acc;
    const aWins = picksTrulyBetter ? trulyBetterIsA : !trulyBetterIsA;
    return aWins ? 'a' : 'b';
  }

  return { vote, effectiveAccuracyAt };
}
