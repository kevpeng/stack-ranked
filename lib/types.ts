/**
 * SHARED DOMAIN CONTRACT — owned by the coordinator.
 *
 * Every agent codes against this file. Do NOT edit it without raising the
 * change in coord/status/<you>.md first; a unilateral edit here breaks the
 * other three agents silently.
 *
 * Design docs this implements: docs/02 (model), docs/05 (schema).
 */

export type ItemId = string;
export type ListId = string;
export type VoterId = string;

/** Which side won a duel. 'tie' = "too close to call" (docs/02 §3.3). */
export type Outcome = 'a' | 'b' | 'tie';

/** Why a duel was asked (docs/02 §2). Recorded for tuning + honest measurement. */
export type DuelStrategy = 'placement' | 'infogain' | 'cutline' | 'audit';

/** Coarse bucket chosen before binary insertion (docs/02 §2.1). */
export type Tier = 'now' | 'next' | 'later' | 'never';

export type ItemState = 'active' | 'completed' | 'canceled';

/** Duel-card evidence chips (docs/01). All optional — most tickets have few. */
export interface Evidence {
  arr?: number;
  customers?: number;
  requester?: string;
  requesterRole?: string;
  links?: string[];
}

export interface Item {
  id: ItemId;
  /** Display key from the tracker, e.g. "ENG-123". Never used as a join key. */
  externalKey: string;
  title: string;
  /** The single line shown on a duel card. Never the raw description. */
  summaryLine: string;
  labels: string[];
  /** Relative size if the tracker has it. Shown as a chip; not used in scoring. */
  estimate: number | null;
  state: ItemState;
  evidence: Evidence;
  /** ISO 8601. */
  createdAtExternal: string;
  /** Linear priority 0-4 (0=none, 1=urgent .. 4=low). Cold-start seed only. */
  externalPriority: number | null;
  /** Linear sortOrder float. Cold-start seed only. */
  externalSortOrder: number | null;
}

/** Immutable. Append-only. NEVER updated — corrections are new rows (docs/05). */
export interface Comparison {
  id: string;
  listId: ListId;
  /** One voter today; present so multiplayer stays additive (docs/08). */
  voterId: VoterId;
  itemAId: ItemId;
  itemBId: ItemId;
  outcome: Outcome;
  strategy: DuelStrategy;
  /** Held out of the fit; used only to measure self-consistency (docs/02 §2.4). */
  isAudit: boolean;
  latencyMs: number | null;
  /** ISO 8601. */
  createdAt: string;
}

/** Derived state. Fully recomputable from the comparison log. */
export interface Rating {
  itemId: ItemId;
  /** Latent strength, log scale (beta). Centered so the mean is 0. */
  theta: number;
  /** Uncertainty from the bootstrap. */
  sigma: number;
  /** 1-indexed. */
  rank: number;
  /** Bootstrap 90% rank interval (docs/02 §4). */
  rankLo: number;
  rankHi: number;
  /** 0-100, presentation only. Never show raw theta. */
  score: number;
  comparisonCount: number;
  /** Drives the confidence metric and cut-line pair selection (docs/02 §6). */
  pAboveCutline: number;
}

export interface Duel {
  itemA: Item;
  itemB: Item;
  strategy: DuelStrategy;
  isAudit: boolean;
}

export interface ListConfig {
  id: ListId;
  name: string;
  /** Items above the cut line. */
  capacityItems: number;
  decayHalflifeDays: number;
  /**
   * The order seeded from the tracker at creation. KEPT FOREVER — powers the
   * seed-vs-settled diff, which is the product's first-session payoff
   * (docs/02 §5, docs/03 §1). Never clear this.
   */
  seedOrder: ItemId[];
  createdAt: string;
}

/** Tuning parameters. Defaults from docs/02 §8 — all are guesses to be measured. */
export interface ScoringParams {
  /** Comparison noise. Tighter than multiplayer (single voter). */
  noiseBeta: number;
  /** Prior strength in pseudo-comparisons against a phantom item at theta=1. */
  priorKappa: number;
  decayHalflifeDays: number;
  bootstrapB: number;
  auditFraction: number;
  maxPlacementTaps: number;
  /** P(above cut line) thresholds for "confidently in/out". */
  confidentHi: number;
  confidentLo: number;
}

export const DEFAULT_PARAMS: ScoringParams = {
  noiseBeta: 0.45,
  priorKappa: 1.5,
  decayHalflifeDays: 90,
  bootstrapB: 200,
  auditFraction: 0.1,
  maxPlacementTaps: 6,
  confidentHi: 0.95,
  confidentLo: 0.05,
};

/** One row of the seed-vs-settled diff (docs/03 §1). */
export interface DiffRow {
  itemId: ItemId;
  title: string;
  seedRank: number;
  settledRank: number;
  delta: number;
  /** Crossed the cut line in either direction. */
  crossedCutline: boolean;
}

export interface ListDiff {
  movedCount: number;
  totalCount: number;
  crossedCutlineCount: number;
  biggestRiser: DiffRow | null;
  biggestFaller: DiffRow | null;
  rows: DiffRow[];
}

/** Aggregate list health shown in the UI header (docs/02 §6). */
export interface ListStatus {
  /** Fraction of items confidently in or out of the cut line. 0..1 */
  confidence: number;
  comparisonCount: number;
  placedCount: number;
  unplacedCount: number;
  /** Self-consistency measured on the held-out audit set. null until enough data. */
  auditAccuracy: number | null;
}
