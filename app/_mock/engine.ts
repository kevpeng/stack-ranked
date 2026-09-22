/**
 * Mock scoring engine — a deliberately simplified stand-in for the real
 * Bradley-Terry fit in lib/scoring/** (owned by @backend). It exists only
 * so every FE screen has believable, internally-consistent data (progress,
 * confidence, pAboveCutline, rank intervals, movement) before the real API
 * lands. It is NOT the scoring model described in docs/02 — just something
 * that behaves in the same *shape* (converges, gets more confident with
 * more taps, respects a cut line, produces a sensible diff).
 *
 * Runs entirely client-side (see app/_mock/store.ts) — never imports
 * lib/db or lib/scoring.
 */
import type {
  Comparison,
  DiffRow,
  Duel,
  DuelStrategy,
  Item,
  ItemId,
  ListConfig,
  ListDiff,
  ListStatus,
  Outcome,
  Rating,
  Tier,
} from '@/lib/types';
import { DEFAULT_PARAMS } from '@/lib/types';
import { estimateSessionLength } from '@/app/_lib/session';

const KAPPA = 1.5; // prior pseudo-comparisons, mirrors docs/02 §3.2
const SEED_PRIOR_WEIGHT = 1; // how many "duels worth" the seed prior counts for

export interface ItemRuntime {
  item: Item;
  wins: number;
  losses: number;
  duelCount: number;
  placed: boolean;
  tier: Tier | null;
  seedTheta: number;
}

export interface PlacementState {
  itemId: ItemId;
  tier: Tier;
  lo: number;
  hi: number;
  taps: number;
}

export interface ListRuntime {
  config: ListConfig;
  itemsById: Map<ItemId, ItemRuntime>;
  comparisons: Comparison[];
  activePlacement: PlacementState | null;
  sessionDuelCount: number; // non-placement duels asked this "session"
}

let voterIdCounter = 0;
export const MOCK_VOTER_ID = 'voter-local';

function nextId(prefix: string): string {
  voterIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${voterIdCounter}`;
}

/** Seed order per docs/02 §5: priority group, then manual tracker sort order within it. */
export function deriveSeedOrder(items: Item[]): ItemId[] {
  const priorityRank = (p: number | null) => {
    if (p === null) return 5;
    if (p === 0) return 4.5; // "no priority" sits near the back, not the very front
    return p; // 1 (urgent) .. 4 (low)
  };
  return [...items]
    .sort((a, b) => {
      const pa = priorityRank(a.externalPriority);
      const pb = priorityRank(b.externalPriority);
      if (pa !== pb) return pa - pb;
      return (a.externalSortOrder ?? 0) - (b.externalSortOrder ?? 0);
    })
    .map((i) => i.id);
}

export function createListRuntime(
  config: ListConfig,
  items: Item[],
  initiallyUnplacedIds: Set<ItemId>,
): ListRuntime {
  const seedOrder = config.seedOrder;
  const n = seedOrder.length;
  const itemsById = new Map<ItemId, ItemRuntime>();
  seedOrder.forEach((id, idx) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    // Linearly spaced from +2 (best seed rank) to -2 (worst), a WEAK prior —
    // a handful of real comparisons overwhelms it (docs/02 §5).
    const seedTheta = n > 1 ? 2 - (4 * idx) / (n - 1) : 0;
    const placed = !initiallyUnplacedIds.has(id);
    itemsById.set(id, {
      item,
      wins: 0,
      losses: 0,
      duelCount: 0,
      placed,
      tier: null,
      seedTheta,
    });
  });
  return {
    config,
    itemsById,
    comparisons: [],
    activePlacement: null,
    sessionDuelCount: 0,
  };
}

function effectiveTheta(rt: ItemRuntime): number {
  const observed = Math.log((rt.wins + KAPPA) / (rt.losses + KAPPA));
  const w = SEED_PRIOR_WEIGHT;
  return (rt.seedTheta * w + observed * rt.duelCount) / (w + rt.duelCount);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export interface RecomputeResult {
  ratings: Rating[];
  status: ListStatus;
  sortedPlaced: ItemRuntime[]; // sorted best-first, for duel selection
}

export function recompute(list: ListRuntime): RecomputeResult {
  const placed = [...list.itemsById.values()].filter((rt) => rt.placed);
  const withTheta = placed.map((rt) => ({ rt, theta: effectiveTheta(rt) }));
  withTheta.sort((a, b) => b.theta - a.theta);

  const n = withTheta.length;
  const cap = list.config.capacityItems;
  const boundaryTheta =
    n === 0
      ? 0
      : cap <= 0
        ? withTheta[0].theta + 1
        : cap >= n
          ? withTheta[n - 1].theta - 1
          : withTheta[cap - 1].theta;

  const totalComparisons = list.comparisons.length;
  // How far the SESSION has gotten overall (docs/02 §1: budget ~3x item
  // count) — confidence can only climb toward its ceiling as the whole
  // list matures, never from one item's duels alone.
  const maturityFactor = n > 0 ? clamp01(totalComparisons / (n * 2.2)) : 0;

  // "Certainty" is deliberately NOT a Wald/bootstrap interval — it's a
  // simple product of three independent 0..1 factors, each guarding
  // against a specific way this could lie to the user:
  //  - decisiveness: a near-50/50 win record stays ~0 no matter how many
  //    times it's asked (this is what keeps a noisy/inconsistent voter
  //    from ever reading as confident — docs/03's fatigue section).
  //  - evidenceFactor: a single lucky win can't look decisive; needs a
  //    handful of its OWN duels first.
  //  - rankGapFrac: items right at the boundary can never become
  //    "confident" (correctly — some genuine indifference always remains,
  //    docs/02 §6), only ones clearly on one side of it.
  // Normalize by the LARGEST possible distance from the boundary (not just
  // n) so the single most-extreme item on each side can actually reach a
  // rankGapFrac of 1 — the cap usually isn't centered, so raw |rank-cap|/n
  // caps out well under 1 for every item and confidence could never cross
  // the confident threshold no matter how decisive the evidence got.
  const maxGap = Math.max(cap - 1, n - cap, 1);

  const ratings: Rating[] = withTheta.map(({ rt, theta }, idx) => {
    const rank = idx + 1;
    const decisiveness = rt.duelCount > 0 ? clamp01(Math.abs(rt.wins - rt.losses) / rt.duelCount) : 0;
    const evidenceFactor = clamp01(rt.duelCount / 4);
    const rankGapFrac = clamp01(Math.abs(rank - cap) / maxGap);
    const certainty = Math.sqrt(decisiveness) * Math.sqrt(rankGapFrac) * evidenceFactor * maturityFactor;
    const pAboveCutline = theta >= boundaryTheta ? 0.5 + 0.5 * certainty : 0.5 - 0.5 * certainty;
    const sigma = 1 - certainty;
    const spread = Math.min(Math.round(sigma * n * 0.4), Math.floor(n / 2));
    const score = Math.max(1, Math.min(99, Math.round(50 + theta * 14)));
    return {
      itemId: rt.item.id,
      theta,
      sigma,
      rank,
      rankLo: Math.max(1, rank - spread),
      rankHi: Math.min(Math.max(n, 1), rank + spread),
      score,
      comparisonCount: rt.duelCount,
      pAboveCutline,
    };
  });

  const confidentCount = ratings.filter(
    (r) => r.pAboveCutline > DEFAULT_PARAMS.confidentHi || r.pAboveCutline < DEFAULT_PARAMS.confidentLo,
  ).length;
  const confidence = n === 0 ? 0 : confidentCount / n;

  const unplacedCount = [...list.itemsById.values()].filter((rt) => !rt.placed).length;

  const auditComparisons = list.comparisons.filter((c) => c.isAudit);
  const tieRate =
    list.comparisons.length > 0
      ? list.comparisons.filter((c) => c.outcome === 'tie').length / list.comparisons.length
      : 0;
  const auditAccuracy =
    auditComparisons.length < 8
      ? null
      : Math.round(
          Math.max(0.6, Math.min(0.96, 0.8 + Math.min(0.12, list.comparisons.length / 1500) - tieRate * 0.15)) * 100,
        ) / 100;

  const status: ListStatus = {
    confidence,
    comparisonCount: list.comparisons.length,
    placedCount: n,
    unplacedCount,
    auditAccuracy,
  };

  return { ratings, status, sortedPlaced: withTheta.map((w) => w.rt) };
}

function tierBounds(n: number, tier: Tier): [number, number] {
  const q = Math.max(1, Math.round(n / 4));
  switch (tier) {
    case 'now':
      return [0, Math.min(q, n)];
    case 'next':
      return [Math.min(q, n), Math.min(2 * q, n)];
    case 'later':
      return [Math.min(2 * q, n), Math.min(3 * q, n)];
    case 'never':
    default:
      return [Math.min(3 * q, n), n];
  }
}

function midWithJitter(lo: number, hi: number, taps: number): number {
  const mid = (lo + hi) / 2;
  const jitter = taps % 2 === 0 ? 0.5 : -0.5;
  const idx = Math.round(mid + jitter);
  return Math.max(lo, Math.min(hi - 1, idx));
}

/** Starts a placement binary search for an unplaced item within a tier. Mutates `list`. */
export function beginPlacement(list: ListRuntime, itemId: ItemId, tier: Tier): Duel | null {
  const rt = list.itemsById.get(itemId);
  if (!rt) return null;
  rt.tier = tier;

  const { sortedPlaced } = recompute(list);
  const n = sortedPlaced.length;

  // "Never" is a one-tap archive (docs/01 §Intake) — no placement duels,
  // it just lands at the very bottom of the order.
  if (tier === 'never') {
    finalizePlacement(list, itemId, n, sortedPlaced);
    return null;
  }

  const [lo, hi] = tierBounds(n, tier);

  if (hi - lo < 1 || n === 0) {
    finalizePlacement(list, itemId, lo, sortedPlaced);
    return null;
  }

  list.activePlacement = { itemId, tier, lo, hi, taps: 0 };
  const candidateIdx = midWithJitter(lo, hi, 0);
  const candidate = sortedPlaced[Math.max(0, Math.min(sortedPlaced.length - 1, candidateIdx))];
  if (!candidate || candidate.item.id === itemId) {
    finalizePlacement(list, itemId, lo, sortedPlaced);
    return null;
  }
  return { itemA: rt.item, itemB: candidate.item, strategy: 'placement', isAudit: false };
}

function finalizePlacement(list: ListRuntime, itemId: ItemId, insertionIdx: number, sortedPlaced: ItemRuntime[]) {
  const rt = list.itemsById.get(itemId);
  if (!rt) return;
  const n = sortedPlaced.length;
  const clampedIdx = Math.max(0, Math.min(n, insertionIdx));
  let newTheta: number;
  if (n === 0) newTheta = 0;
  else if (clampedIdx <= 0) newTheta = effectiveTheta(sortedPlaced[0]) + 0.5;
  else if (clampedIdx >= n) newTheta = effectiveTheta(sortedPlaced[n - 1]) - 0.5;
  else {
    const above = effectiveTheta(sortedPlaced[clampedIdx - 1]);
    const below = effectiveTheta(sortedPlaced[clampedIdx]);
    newTheta = (above + below) / 2;
  }
  // Placement comparisons are ordinary comparisons (docs/02 §2.1) — wins/
  // losses/duelCount accumulated during the binary search are kept as real
  // evidence. seedTheta is just a cold-start anchor, exactly like every
  // other item's initial seed value, and gets blended with that evidence
  // by effectiveTheta().
  rt.seedTheta = newTheta;
  rt.placed = true;
  list.activePlacement = null;
}

function continuePlacement(list: ListRuntime, outcome: Outcome): Duel | null {
  const p = list.activePlacement;
  if (!p) return null;
  const { sortedPlaced } = recompute(list);
  const n = sortedPlaced.length;
  const candidateIdx = midWithJitter(p.lo, p.hi, p.taps);
  const clamped = Math.max(0, Math.min(n - 1, candidateIdx));

  if (outcome === 'tie') {
    if (p.taps % 2 === 0) p.hi = clamped;
    else p.lo = clamped;
  } else if (outcome === 'a') {
    // itemA was the placement item in beginPlacement's convention; caller
    // normalizes so 'a' always means "placement item won" here.
    p.hi = clamped;
  } else {
    p.lo = clamped;
  }
  p.taps += 1;

  if (p.hi - p.lo <= 1 || p.taps >= DEFAULT_PARAMS.maxPlacementTaps) {
    const insertAt = Math.round((p.lo + p.hi) / 2);
    finalizePlacement(list, p.itemId, insertAt, sortedPlaced);
    return null;
  }

  const nextCandidateIdx = midWithJitter(p.lo, p.hi, p.taps);
  const candidate = sortedPlaced[Math.max(0, Math.min(sortedPlaced.length - 1, nextCandidateIdx))];
  const rt = list.itemsById.get(p.itemId);
  if (!rt || !candidate || candidate.item.id === p.itemId) {
    finalizePlacement(list, p.itemId, p.lo, sortedPlaced);
    return null;
  }
  return { itemA: rt.item, itemB: candidate.item, strategy: 'placement', isAudit: false };
}

export function isSessionComplete(list: ListRuntime): boolean {
  const { status, sortedPlaced } = recompute(list);
  if (sortedPlaced.length === 0) return true;
  // The advertised "~N duels" (docs/02 §1's ~3x-item-count budget) IS the
  // finish line — matches the session length shown in the UI exactly.
  const target = estimateSessionLength(sortedPlaced.length);
  if (list.sessionDuelCount >= target) return true;
  // Finish early if confidence is already in a good place partway through
  // (docs/03 §2's bar "accelerates" — it doesn't have to hit ~100%, the
  // spec's own example stops a session at a 68% bar).
  return list.sessionDuelCount >= target * 0.5 && status.confidence >= 0.55;
}

function pickRandomPair(pool: ItemRuntime[]): [ItemRuntime, ItemRuntime] | null {
  if (pool.length < 2) return null;
  const i = Math.floor(Math.random() * pool.length);
  let j = Math.floor(Math.random() * pool.length);
  let guard = 0;
  while (j === i && guard < 10) {
    j = Math.floor(Math.random() * pool.length);
    guard += 1;
  }
  if (i === j) return null;
  return [pool[i], pool[j]];
}

// Below this many duels, an item's own record is too thin to ever become
// confident (SE floor is dominated by SE_KAPPA) — infogain keeps feeding it
// duels throughout the WHOLE session, not just an initial cold-start burst,
// mirroring docs/02 §2.2's "(σ_i²+σ_j²) — prefer items we're unsure about"
// running alongside cut-line relevance rather than as a one-time phase.
const UNDERSAMPLED_FLOOR = 7;

/** General (non-placement) duel selection: undersampled infogain blended with cut-line focus, +audit. */
export function selectGeneralDuel(list: ListRuntime): Duel | null {
  if (isSessionComplete(list)) return null;

  const { ratings, sortedPlaced } = recompute(list);
  if (sortedPlaced.length < 2) return null;
  const byRating = new Map(ratings.map((r) => [r.itemId, r]));

  let strategy: DuelStrategy = 'infogain';
  let isAudit = false;
  let pair: [ItemRuntime, ItemRuntime] | null = null;

  if (Math.random() < DEFAULT_PARAMS.auditFraction) {
    isAudit = true;
    strategy = 'audit';
    pair = pickRandomPair(sortedPlaced);
  }

  const undersampled = sortedPlaced.filter((rt) => rt.duelCount < UNDERSAMPLED_FLOOR);
  const undersampledFrac = undersampled.length / sortedPlaced.length;

  if (!pair && undersampled.length >= 1 && Math.random() < Math.max(0.15, undersampledFrac)) {
    strategy = 'infogain';
    const target = [...undersampled].sort((a, b) => a.duelCount - b.duelCount)[0];
    // Ramping difficulty (docs/01): pair the undersampled item with whatever
    // partner currently looks most different from it — an obvious, fast
    // comparison that still adds real evidence to the thin side.
    const partnerPool = sortedPlaced.filter((rt) => rt.item.id !== target.item.id);
    const targetTheta = byRating.get(target.item.id)?.theta ?? 0;
    const partner = partnerPool.reduce<ItemRuntime | undefined>((best, cur) => {
      const bestGap = best ? Math.abs((byRating.get(best.item.id)?.theta ?? 0) - targetTheta) : -1;
      const curGap = Math.abs((byRating.get(cur.item.id)?.theta ?? 0) - targetTheta);
      return curGap > bestGap ? cur : best;
    }, undefined);
    pair = partner ? [target, partner] : pickRandomPair(sortedPlaced);
  }

  if (!pair) {
    strategy = 'cutline';
    const candidates = [...sortedPlaced].sort((x, y) => {
      const px = Math.abs((byRating.get(x.item.id)?.pAboveCutline ?? 0.5) - 0.5);
      const py = Math.abs((byRating.get(y.item.id)?.pAboveCutline ?? 0.5) - 0.5);
      return px - py;
    });
    const pool = candidates.slice(0, Math.min(8, candidates.length));
    pair = pickRandomPair(pool) ?? pickRandomPair(sortedPlaced);
  }

  if (!pair) return null;
  const [x, y] = pair;
  return { itemA: x.item, itemB: y.item, strategy, isAudit };
}

export interface VoteInput {
  itemAId: ItemId;
  itemBId: ItemId;
  outcome: Outcome;
  strategy: DuelStrategy;
  isAudit: boolean;
  latencyMs: number | null;
}

export interface VoteResult {
  ratings: Rating[];
  status: ListStatus;
  nextDuel: Duel | null;
  comparison: Comparison;
}

export function applyVote(list: ListRuntime, input: VoteInput): VoteResult {
  const a = list.itemsById.get(input.itemAId);
  const b = list.itemsById.get(input.itemBId);
  const comparison: Comparison = {
    id: nextId('cmp'),
    listId: list.config.id,
    voterId: MOCK_VOTER_ID,
    itemAId: input.itemAId,
    itemBId: input.itemBId,
    outcome: input.outcome,
    strategy: input.strategy,
    isAudit: input.isAudit,
    latencyMs: input.latencyMs,
    createdAt: new Date().toISOString(),
  };
  list.comparisons.push(comparison);

  if (a && b) {
    a.duelCount += 1;
    b.duelCount += 1;
    if (input.outcome === 'tie') {
      a.wins += 0.5;
      a.losses += 0.5;
      b.wins += 0.5;
      b.losses += 0.5;
    } else if (input.outcome === 'a') {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
  }

  let nextDuel: Duel | null;
  if (input.strategy === 'placement' && list.activePlacement) {
    // Normalize outcome to "did the placement item win" as continuePlacement expects.
    const placementIsA = list.activePlacement.itemId === input.itemAId;
    const normalized: Outcome =
      input.outcome === 'tie' ? 'tie' : placementIsA === (input.outcome === 'a') ? 'a' : 'b';
    nextDuel = continuePlacement(list, normalized);
  } else {
    list.sessionDuelCount += 1;
    nextDuel = selectGeneralDuel(list);
  }

  const { ratings, status } = recompute(list);
  return { ratings, status, nextDuel, comparison };
}

export function buildDiff(list: ListRuntime, seedOrder: ItemId[]): ListDiff {
  const { sortedPlaced } = recompute(list);
  const settledRankById = new Map<ItemId, number>();
  sortedPlaced.forEach((rt, idx) => settledRankById.set(rt.item.id, idx + 1));

  const seedRankById = new Map<ItemId, number>();
  seedOrder.forEach((id, idx) => seedRankById.set(id, idx + 1));

  const cap = list.config.capacityItems;
  const rows: DiffRow[] = [];
  for (const rt of sortedPlaced) {
    const seedRank = seedRankById.get(rt.item.id);
    const settledRank = settledRankById.get(rt.item.id);
    if (seedRank === undefined || settledRank === undefined) continue;
    const delta = seedRank - settledRank;
    const crossedCutline = seedRank <= cap !== settledRank <= cap;
    rows.push({
      itemId: rt.item.id,
      title: rt.item.title,
      seedRank,
      settledRank,
      delta,
      crossedCutline,
    });
  }

  const movedRows = rows.filter((r) => r.delta !== 0);
  let biggestRiser: DiffRow | null = null;
  let biggestFaller: DiffRow | null = null;
  for (const r of rows) {
    if (r.delta > 0 && (!biggestRiser || r.delta > biggestRiser.delta)) biggestRiser = r;
    if (r.delta < 0 && (!biggestFaller || r.delta < biggestFaller.delta)) biggestFaller = r;
  }

  return {
    movedCount: movedRows.length,
    totalCount: rows.length,
    crossedCutlineCount: rows.filter((r) => r.crossedCutline).length,
    biggestRiser,
    biggestFaller,
    rows: rows.sort((x, y) => x.settledRank - y.settledRank),
  };
}
