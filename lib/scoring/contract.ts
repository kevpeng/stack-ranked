/**
 * SCORING ENGINE CONTRACT — owned by the coordinator, implemented by @backend.
 *
 * These signatures are what @backend must export from lib/scoring/index.ts.
 * @qa writes tests against exactly these. @backend may add internal helpers
 * freely but must not change these signatures without raising it in
 * coord/status/backend.md.
 *
 * Implements docs/02. Section references below are load-bearing — read them.
 */

import type {
  Comparison, Duel, Item, ItemId, Rating, ScoringParams, Tier, ListStatus,
} from '@/lib/types';

export interface FitInput {
  items: Item[];
  comparisons: Comparison[];
  params: ScoringParams;
  /** Cold-start prior: seeded order from the tracker (docs/02 §5). */
  seedOrder?: ItemId[];
  /** Evaluate decay relative to this instant. Defaults to now. Injectable for tests. */
  now?: Date;
  /** Deterministic bootstrap/selection. ALWAYS pass in tests. */
  seed?: number;
}

/**
 * Fit Bradley-Terry by MM (docs/02 §3.1). Returns theta (log scale, mean-centered).
 *
 * MUST be finite for every item, including undefeated and winless ones — that is
 * what priorKappa exists for (docs/02 §3.2). An item with zero comparisons must
 * come back at theta≈0, not NaN. This is the single most important invariant in
 * the engine and the first placement in the app will exercise it.
 */
export type FitBradleyTerry = (input: FitInput) => Map<ItemId, number>;

/**
 * Full ratings with bootstrap rank intervals (docs/02 §4) and pAboveCutline.
 * Ranks are 1-indexed, dense, and cover every item in `items`.
 */
export type ComputeRatings = (
  input: FitInput & { capacityItems: number },
) => Rating[];

/**
 * Pick the next duel (docs/02 §2.2-§2.4).
 *
 * - Honours auditFraction: roughly that share of returned duels must be
 *   uniformly random with isAudit=true and strategy='audit'.
 * - Never returns a pair already compared within one decay half-life unless
 *   nothing else is available.
 * - Returns null when the list is confident enough that nothing is worth asking.
 * - Must be deterministic given `seed`.
 */
export type SelectNextDuel = (
  input: FitInput & { capacityItems: number; ratings: Rating[] },
) => Duel | null;

/**
 * Binary-insertion probe for placing an unplaced item (docs/02 §2.1).
 * Returns the opponent to show next, or null when placement is complete
 * (bounds converged or maxPlacementTaps reached).
 */
export type NextPlacementDuel = (input: {
  item: Item;
  tier: Tier;
  ranked: Rating[];
  items: Item[];
  /** Comparisons already made for THIS placement, oldest first. */
  placementComparisons: Comparison[];
  params: ScoringParams;
  seed?: number;
}) => Duel | null;

/**
 * Fraction of items confidently in or out of the cut line (docs/02 §6),
 * plus audit-set accuracy. Returns 0 confidence for an unstarted list.
 */
export type ComputeListStatus = (input: {
  ratings: Rating[];
  comparisons: Comparison[];
  items: Item[];
  params: ScoringParams;
  unplacedCount: number;
}) => ListStatus;
