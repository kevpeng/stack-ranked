/**
 * lib/sim/run.ts — the simulation harness. `npm run sim`.
 *
 * Pure TypeScript over lib/scoring: no DB, no UI, no network (docs/02 §7,
 * docs/05 "the simulation harness"). Drives the REAL elicitation loop
 * (selectNextDuel -> synthetic voter -> computeRatings -> computeListStatus)
 * against synthetic worlds with known ground truth, and reports what
 * actually happened against what docs/02 predicts.
 *
 * Imports only from lib/scoring's public contract (via lib/scoring/index.ts)
 * and lib/types.ts — both read-only, coordinator-owned (coord/DASHBOARD.md).
 * Everything else here is self-contained under lib/sim/.
 *
 * See coord/status/sim.md for the full write-up of what this found,
 * including why several numbers below come out very different from
 * docs/02 §1's table, with a diagnosed mechanism (not just a raw number).
 */

import type {
  Item, ItemId, Comparison, Rating, ScoringParams, ListStatus, DuelStrategy,
} from '../types';
import { DEFAULT_PARAMS } from '../types';
import { computeRatings, selectNextDuel, computeListStatus } from '../scoring/index';
import { createSyntheticVoter, type SyntheticVoter, type FatigueConfig } from './voter';
import { generateWorld, trueRankMap, type WorldItem } from './world';
import { spearman } from './spearman';
import { makeRng, subSeed } from './rng';

const T_START = Date.now();
function log(msg: string): void {
  console.log(`[${((Date.now() - T_START) / 1000).toFixed(1)}s] ${msg}`);
}

// ---------------------------------------------------------------------------
// Formatting helpers (zero dependencies, plain console output)
// ---------------------------------------------------------------------------

function padRight(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}
function printTable(title: string, headers: string[], rows: string[][]): void {
  console.log(`\n=== ${title} ===`);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  console.log(headers.map((h, i) => padRight(h, widths[i])).join('  '));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(row.map((c, i) => padRight(c, widths[i])).join('  '));
}
function pct(x: number | null): string {
  return x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}
function fmtDuels(x: number | null, cap: number): string {
  if (x === null) return `>${cap} (not reached)`;
  return String(x);
}

// ---------------------------------------------------------------------------
// Session runner — drives the real elicitation loop end to end
// ---------------------------------------------------------------------------

interface StepSnapshot {
  duels: number;
  confidence: number;
  spearmanRho: number;
  auditAccuracy: number | null;
}

interface SessionResult {
  mode: 'adaptive' | 'random';
  n: number;
  capacityItems: number;
  snapshots: StepSnapshot[]; // index i = snapshot after i duels
  confidenceTarget: number;
  duelsToConfident: number | null;
  finalConfidence: number;
  finalSpearman: number;
  finalAuditAccuracy: number | null;
  stoppedEarly: boolean;
  duelsRun: number;
  comparisons: Comparison[];
  world: WorldItem[];
  strategyCounts: Record<string, number>;
}

function runSession(opts: {
  world: WorldItem[];
  capacityItems: number;
  scoringParams: ScoringParams;
  voter: SyntheticVoter;
  mode: 'adaptive' | 'random';
  maxDuels: number;
  confidenceTarget: number;
  masterSeed: number;
  /** Resume from a prior session's comparisons instead of starting cold. */
  seedComparisons?: Comparison[];
  /** Duel-index offset for fatigue continuity when resuming. */
  tapIndexOffset?: number;
  /** Wall-clock offset (ms) for the first new duel's `now`/createdAt. */
  baseTimeMs?: number;
}): SessionResult {
  const {
    world, capacityItems, scoringParams, voter, mode, maxDuels, confidenceTarget, masterSeed,
  } = opts;

  const items: Item[] = world;
  const trueRank = trueRankMap(world);
  const itemById = new Map(world.map((w) => [w.id, w]));
  const orderedIds = world.map((w) => w.id);
  const trueRanksArr = orderedIds.map((id) => trueRank.get(id)!);

  const comparisons: Comparison[] = opts.seedComparisons ? [...opts.seedComparisons] : [];
  const tapOffset = opts.tapIndexOffset ?? 0;
  const baseTime = opts.baseTimeMs ?? Date.parse('2026-01-01T00:00:00.000Z');
  const snapshots: StepSnapshot[] = [];
  let duelsToConfident: number | null = null;
  let stoppedEarly = false;
  const strategyCounts: Record<string, number> = {};

  function snapshot(ratings: Rating[], status: ListStatus, duels: number): void {
    const ratingByItem = new Map(ratings.map((r) => [r.itemId, r]));
    const fittedRanksArr = orderedIds.map((id) => ratingByItem.get(id)?.rank ?? world.length + 1);
    const rho = spearman(fittedRanksArr, trueRanksArr);
    snapshots.push({ duels, confidence: status.confidence, spearmanRho: rho, auditAccuracy: status.auditAccuracy });
    if (duelsToConfident === null && status.confidence >= confidenceTarget) duelsToConfident = duels;
  }

  for (let t = 1; t <= maxDuels; t++) {
    const now = new Date(baseTime + t * 5000); // 5s/duel (docs/02 §1)
    const ratings = computeRatings({
      items, comparisons, params: scoringParams, capacityItems, now, seed: subSeed(masterSeed, `ratings-${t}`),
    });
    const status = computeListStatus({ ratings, comparisons, items, params: scoringParams, unplacedCount: 0 });
    snapshot(ratings, status, comparisons.length);

    let aId: ItemId;
    let bId: ItemId;
    let strategy: DuelStrategy;
    let isAudit: boolean;

    if (mode === 'adaptive') {
      const duel = selectNextDuel({
        items, comparisons, params: scoringParams, capacityItems, ratings, now, seed: subSeed(masterSeed, `select-${t}`),
      });
      if (!duel) { stoppedEarly = true; break; }
      aId = duel.itemA.id; bId = duel.itemB.id; strategy = duel.strategy; isAudit = duel.isAudit;
    } else {
      // Uniformly random pair. Tagged strategy:'infogain' purely because
      // DuelStrategy (lib/types.ts, frozen) has no 'random' value -- it does
      // not affect the fit (buildCompArrays only reads isAudit / outcome /
      // createdAt / itemA / itemB). isAudit is deliberately false: a
      // uniformly random policy has no adaptive-selection bias to correct
      // for, so docs/02 §2.4's rationale for holding out an audit slice
      // doesn't apply to it.
      const rrng = makeRng(subSeed(masterSeed, `random-${t}`));
      let ai = Math.floor(rrng() * orderedIds.length);
      let bi = Math.floor(rrng() * (orderedIds.length - 1));
      if (bi >= ai) bi += 1;
      aId = orderedIds[ai]; bId = orderedIds[bi];
      strategy = 'infogain'; isAudit = false;
    }
    strategyCounts[isAudit ? 'audit' : strategy] = (strategyCounts[isAudit ? 'audit' : strategy] ?? 0) + 1;

    const itemA = itemById.get(aId)!;
    const itemB = itemById.get(bId)!;
    const outcome = voter.vote({
      itemA: { id: itemA.id, trueTheta: itemA.trueTheta, labels: itemA.labels },
      itemB: { id: itemB.id, trueTheta: itemB.trueTheta, labels: itemB.labels },
      tapIndexInSession: tapOffset + t,
    });

    comparisons.push({
      id: `c-${comparisons.length}`,
      listId: 'sim-list',
      voterId: 'sim-voter',
      itemAId: aId,
      itemBId: bId,
      outcome,
      strategy,
      isAudit,
      latencyMs: null,
      createdAt: now.toISOString(),
    });
  }

  {
    const now = new Date(baseTime + (comparisons.length - (opts.seedComparisons?.length ?? 0) + 1) * 5000);
    const ratings = computeRatings({
      items, comparisons, params: scoringParams, capacityItems, now, seed: subSeed(masterSeed, 'ratings-final'),
    });
    const status = computeListStatus({ ratings, comparisons, items, params: scoringParams, unplacedCount: 0 });
    snapshot(ratings, status, comparisons.length);
  }

  const last = snapshots[snapshots.length - 1];
  const newDuels = comparisons.length - (opts.seedComparisons?.length ?? 0);
  return {
    mode,
    n: world.length,
    capacityItems,
    snapshots,
    confidenceTarget,
    duelsToConfident,
    finalConfidence: last.confidence,
    finalSpearman: last.spearmanRho,
    finalAuditAccuracy: last.auditAccuracy,
    stoppedEarly,
    duelsRun: newDuels,
    comparisons,
    world,
    strategyCounts,
  };
}

/** First duel-count at which confidence >= threshold, per the recorded
 * (duels-indexed) snapshot trajectory. Snapshots are recorded once per
 * distinct duel count, in increasing order, so a linear scan is exact. */
function duelsToReach(snapshots: StepSnapshot[], threshold: number): number | null {
  for (const s of snapshots) if (s.confidence >= threshold) return s.duels;
  return null;
}
function spearmanAt(snapshots: StepSnapshot[], duels: number): number | null {
  // snapshots[i].duels === i by construction (one snapshot per duel count).
  const s = snapshots[duels];
  return s ? s.spearmanRho : null;
}

// ---------------------------------------------------------------------------
// World/N configuration — mirrors docs/02 §1's table exactly, so the
// comparison to its predicted duel counts is apples to apples.
// ---------------------------------------------------------------------------

interface NConfig {
  n: number;
  capacityItems: number;
  docsFloor: number; // docs/02 §1 "cut line only" column
  docsSession: number; // docs/02 §1 "recommended session" column (~2x floor)
}
const N_CONFIGS: NConfig[] = [
  { n: 60, capacityItems: 15, docsFloor: 100, docsSession: 180 },
  { n: 150, capacityItems: 25, docsFloor: 210, docsSession: 300 },
  { n: 300, capacityItems: 30, docsFloor: 310, docsSession: 400 },
];
const CONFIDENCE_TARGET = 0.9;
const THRESHOLDS = [0.3, 0.5, 0.7, 0.9];
const MASTER_SEED = 20260922;

// Per-N duel ceilings, sized from timing probes run before this script was
// finalized (see coord/status/sim.md): computeRatings' cost at a given N is
// roughly CONSTANT per call regardless of how many comparisons have
// accumulated (dominated by the O(n) bootstrap-over-items cost, not the
// O(edges) term), so total session cost is close to linear in duel count --
// measured ~26.5ms/call at n=60, ~66ms/call at n=150, ~157ms/call at n=300.
// Random-mode ceilings are capped lower than "however long it takes to hit
// 90%" on purpose: if random hasn't gotten there within several times
// adaptive's budget, that is itself the answer to experiment 2, and an
// open-ended search isn't worth the wall-clock.
const ADAPTIVE_MAX: Record<number, number> = { 60: 1500, 150: 2000, 300: 1500 };
const RANDOM_MAX: Record<number, number> = { 60: 5000, 150: 4000, 300: 2000 };

// ---------------------------------------------------------------------------
// Experiments 1 + 2 + 3: duels-to-confident, infogain vs random, rank
// recovery vs budget. One adaptive + one random session per N serves all
// three (the random arm's trajectory is also the "random" row of #3).
// ---------------------------------------------------------------------------

function runExperiments123(): { adaptive: SessionResult[]; random: SessionResult[] } {
  const adaptive: SessionResult[] = [];
  const random: SessionResult[] = [];

  for (const cfg of N_CONFIGS) {
    const world = generateWorld({ n: cfg.n, seed: subSeed(MASTER_SEED, `world-${cfg.n}`) });
    const voter = createSyntheticVoter({ seed: subSeed(MASTER_SEED, `voter-${cfg.n}`), accuracy: 0.87 });

    log(`N=${cfg.n} adaptive: running up to ${ADAPTIVE_MAX[cfg.n]} duels...`);
    const a = runSession({
      world, capacityItems: cfg.capacityItems, scoringParams: DEFAULT_PARAMS, voter,
      mode: 'adaptive', maxDuels: ADAPTIVE_MAX[cfg.n], confidenceTarget: CONFIDENCE_TARGET,
      masterSeed: subSeed(MASTER_SEED, `adaptive-${cfg.n}`),
    });
    adaptive.push(a);
    log(`N=${cfg.n} adaptive done: duelsToConfident=${a.duelsToConfident} finalConfidence=${a.finalConfidence.toFixed(3)} finalSpearman=${a.finalSpearman.toFixed(3)} stoppedEarly=${a.stoppedEarly} strategyCounts=${JSON.stringify(a.strategyCounts)}`);

    const voter2 = createSyntheticVoter({ seed: subSeed(MASTER_SEED, `voter-${cfg.n}`), accuracy: 0.87 });
    log(`N=${cfg.n} random: running up to ${RANDOM_MAX[cfg.n]} duels...`);
    const r = runSession({
      world, capacityItems: cfg.capacityItems, scoringParams: DEFAULT_PARAMS, voter: voter2,
      mode: 'random', maxDuels: RANDOM_MAX[cfg.n], confidenceTarget: CONFIDENCE_TARGET,
      masterSeed: subSeed(MASTER_SEED, `random-${cfg.n}`),
    });
    random.push(r);
    log(`N=${cfg.n} random done: duelsToConfident=${r.duelsToConfident} finalConfidence=${r.finalConfidence.toFixed(3)} finalSpearman=${r.finalSpearman.toFixed(3)}`);
  }

  return { adaptive, random };
}

function printExperiment1(adaptive: SessionResult[]): void {
  const rows = adaptive.map((a, i) => {
    const cfg = N_CONFIGS[i];
    const measured = a.duelsToConfident;
    const ratio = measured === null ? 'n/a' : (measured / cfg.docsFloor).toFixed(2) + 'x';
    return [
      String(cfg.n), String(cfg.docsFloor), String(cfg.docsSession),
      fmtDuels(measured, ADAPTIVE_MAX[cfg.n]), ratio,
      pct(spearmanAt(a.snapshots, Math.min(cfg.docsFloor, a.snapshots.length - 1))),
    ];
  });
  printTable(
    'Experiment 1: duels-to-confident (>=90%) vs docs/02 §1 prediction (adaptive selectNextDuel)',
    ['N', 'docs floor', 'docs session (~2x)', 'measured duels', 'measured/floor', 'confidence @ floor duels'],
    rows,
  );

  const thresholdRows = adaptive.map((a, i) => [
    String(N_CONFIGS[i].n),
    ...THRESHOLDS.map((th) => fmtDuels(duelsToReach(a.snapshots, th), ADAPTIVE_MAX[N_CONFIGS[i].n])),
  ]);
  printTable(
    'Experiment 1b: duels to reach each confidence threshold (adaptive)',
    ['N', ...THRESHOLDS.map((t) => `>=${(t * 100).toFixed(0)}%`)],
    thresholdRows,
  );
}

function printExperiment2(adaptive: SessionResult[], random: SessionResult[]): void {
  const rows: string[][] = [];
  for (let i = 0; i < N_CONFIGS.length; i++) {
    const cfg = N_CONFIGS[i];
    const a = adaptive[i];
    const r = random[i];
    for (const th of THRESHOLDS) {
      const da = duelsToReach(a.snapshots, th);
      const dr = duelsToReach(r.snapshots, th);
      let mult = 'n/a';
      if (da !== null && dr !== null) mult = `${(dr / da).toFixed(2)}x`;
      else if (da !== null && dr === null) mult = `>${(RANDOM_MAX[cfg.n] / da).toFixed(2)}x (random never reached ${(th * 100).toFixed(0)}%)`;
      rows.push([
        String(cfg.n), `>=${(th * 100).toFixed(0)}%`,
        fmtDuels(da, ADAPTIVE_MAX[cfg.n]), fmtDuels(dr, RANDOM_MAX[cfg.n]), mult,
      ]);
    }
  }
  printTable(
    'Experiment 2: infogain (adaptive) vs uniformly-random pair selection -- docs/02 §2.2 claims 3-5x',
    ['N', 'threshold', 'adaptive duels', 'random duels', 'multiplier (random/adaptive)'],
    rows,
  );
}

function printExperiment3(adaptive: SessionResult[], random: SessionResult[]): void {
  const budgets = [50, 100, 150, 200, 300, 500, 800, 1200];
  const rows: string[][] = [];
  for (let i = 0; i < N_CONFIGS.length; i++) {
    const cfg = N_CONFIGS[i];
    for (const b of budgets) {
      const aRho = spearmanAt(adaptive[i].snapshots, b);
      const rRho = spearmanAt(random[i].snapshots, b);
      if (aRho === null && rRho === null) continue;
      rows.push([
        String(cfg.n), String(b),
        aRho === null ? 'n/a' : aRho.toFixed(3),
        rRho === null ? 'n/a' : rRho.toFixed(3),
      ]);
    }
  }
  printTable(
    'Experiment 3: Spearman rank-recovery (fitted vs true rank) at various duel budgets',
    ['N', 'duel budget', 'spearman (adaptive)', 'spearman (random)'],
    rows,
  );
}

// ---------------------------------------------------------------------------
// Experiment 4: fatigue impact. Fixed-length ~180-duel sitting (docs/05's
// figure for the N=60 recommended session), constant-accuracy vs fatiguing
// voter, otherwise identical (same world, same selection policy).
// ---------------------------------------------------------------------------

function runExperiment4(): void {
  const n = 60;
  const capacityItems = 15;
  const sessionLen = 180;
  const fatigue: FatigueConfig = { onsetTap: 100, halfLifeTaps: 150, floorAccuracy: 0.5 };

  const rows: string[][] = [];
  const REPEATS = 3;
  const constantFinals: { confidence: number; spearman: number }[] = [];
  const fatiguedFinals: { confidence: number; spearman: number }[] = [];

  for (let rep = 0; rep < REPEATS; rep++) {
    const world = generateWorld({ n, seed: subSeed(MASTER_SEED, `fatigue-world-${rep}`) });

    const voterConst = createSyntheticVoter({ seed: subSeed(MASTER_SEED, `fatigue-voter-${rep}`), accuracy: 0.87 });
    const rConst = runSession({
      world, capacityItems, scoringParams: DEFAULT_PARAMS, voter: voterConst,
      mode: 'adaptive', maxDuels: sessionLen, confidenceTarget: CONFIDENCE_TARGET,
      masterSeed: subSeed(MASTER_SEED, `fatigue-const-${rep}`),
    });
    constantFinals.push({ confidence: rConst.finalConfidence, spearman: rConst.finalSpearman });

    const voterFatigued = createSyntheticVoter({ seed: subSeed(MASTER_SEED, `fatigue-voter-${rep}`), accuracy: 0.87, fatigue });
    const rFatigued = runSession({
      world, capacityItems, scoringParams: DEFAULT_PARAMS, voter: voterFatigued,
      mode: 'adaptive', maxDuels: sessionLen, confidenceTarget: CONFIDENCE_TARGET,
      masterSeed: subSeed(MASTER_SEED, `fatigue-fat-${rep}`),
    });
    fatiguedFinals.push({ confidence: rFatigued.finalConfidence, spearman: rFatigued.finalSpearman });

    rows.push([
      String(rep), rConst.finalSpearman.toFixed(3), rFatigued.finalSpearman.toFixed(3),
      (rConst.finalSpearman - rFatigued.finalSpearman).toFixed(3),
      pct(rConst.finalConfidence), pct(rFatigued.finalConfidence),
    ]);
  }

  printTable(
    `Experiment 4: fatigue impact over a fixed ${sessionLen}-duel sitting (N=${n}), constant vs fatiguing (onset@${fatigue.onsetTap}, halfLife=${fatigue.halfLifeTaps} taps, floor=${fatigue.floorAccuracy})`,
    ['repeat', 'spearman (constant)', 'spearman (fatigued)', 'delta', 'confidence (constant)', 'confidence (fatigued)'],
    rows,
  );

  const meanConstSpearman = constantFinals.reduce((s, x) => s + x.spearman, 0) / REPEATS;
  const meanFatiguedSpearman = fatiguedFinals.reduce((s, x) => s + x.spearman, 0) / REPEATS;
  console.log(`mean spearman: constant=${meanConstSpearman.toFixed(3)} fatigued=${meanFatiguedSpearman.toFixed(3)} delta=${(meanConstSpearman - meanFatiguedSpearman).toFixed(3)}`);

  // What accuracy does the fatigued voter actually reach by tap 180?
  const probe = createSyntheticVoter({ seed: 1, accuracy: 0.87, fatigue });
  console.log(`fatigued voter's effective accuracy: tap1=${probe.effectiveAccuracyAt(1).toFixed(3)} tap100=${probe.effectiveAccuracyAt(100).toFixed(3)} tap140=${probe.effectiveAccuracyAt(140).toFixed(3)} tap180=${probe.effectiveAccuracyAt(180).toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// Experiment 5: decay half-life sensitivity (lowest priority -- "if budget
// allows", docs/02 §3.4 / §7). Two parts on a modest grid:
//   (a) stable list: does confidence erode gently or collapse for a list
//       nobody touches, at different half-lives?
//   (b) churn: after an unambiguous ground-truth priority change, how much
//       does a short (10-duel) maintenance session move pAboveCutline for
//       the changed item, at different half-lives?
// ---------------------------------------------------------------------------

function runExperiment5(): void {
  const n = 60;
  const capacityItems = 15;
  const halfLives = [30, 90, 180, 365];
  const elapsedDaysGrid = [0, 30, 60, 90, 180, 365];

  log('Experiment 5: onboarding a reference N=60 list to seed the decay tests...');
  const world = generateWorld({ n, seed: subSeed(MASTER_SEED, 'decay-world') });
  const voter = createSyntheticVoter({ seed: subSeed(MASTER_SEED, 'decay-voter'), accuracy: 0.87 });
  const onboarding = runSession({
    world, capacityItems, scoringParams: DEFAULT_PARAMS, voter,
    mode: 'adaptive', maxDuels: 1000, confidenceTarget: CONFIDENCE_TARGET,
    masterSeed: subSeed(MASTER_SEED, 'decay-onboard'),
  });
  const sessionEndMs = Date.parse('2026-01-01T00:00:00.000Z') + (onboarding.duelsRun + 1) * 5000;
  log(`reference list onboarded: duelsRun=${onboarding.duelsRun} finalConfidence=${onboarding.finalConfidence.toFixed(3)}`);

  // ---- (a) stable list: confidence vs elapsed time, per half-life ----
  const items: Item[] = world;
  const stableRows: string[][] = [];
  for (const hl of halfLives) {
    const row: string[] = [String(hl)];
    for (const days of elapsedDaysGrid) {
      const now = new Date(sessionEndMs + days * 86_400_000);
      const params: ScoringParams = { ...DEFAULT_PARAMS, decayHalflifeDays: hl };
      const ratings = computeRatings({
        items, comparisons: onboarding.comparisons, params, capacityItems, now, seed: subSeed(MASTER_SEED, `decay-stable-${hl}-${days}`),
      });
      const status = computeListStatus({ ratings, comparisons: onboarding.comparisons, items, params, unplacedCount: 0 });
      row.push(pct(status.confidence));
    }
    stableRows.push(row);
  }
  printTable(
    'Experiment 5a: STABLE list -- confidence vs days since last tap, by decay half-life (no new comparisons)',
    ['half-life (days)', ...elapsedDaysGrid.map((d) => `+${d}d`)],
    stableRows,
  );

  // ---- (b) churn: one item's ground truth jumps; does a short maintenance
  // session (10 duels) at different half-lives correctly move its
  // pAboveCutline? ----
  const byTrueRank = [...world].sort((a, b) => a.trueRank - b.trueRank);
  const escalatedOriginal = byTrueRank[capacityItems + 2]; // comfortably below the cut line originally
  const bestTheta = byTrueRank[0].trueTheta;
  const churnDays = 60;
  const churnRows: string[][] = [];

  for (const hl of halfLives) {
    const now0 = new Date(sessionEndMs + churnDays * 86_400_000);
    const paramsHl: ScoringParams = { ...DEFAULT_PARAMS, decayHalflifeDays: hl };

    // pAboveCutline just before the churn + maintenance (using the ORIGINAL world).
    const ratingsBefore = computeRatings({
      items, comparisons: onboarding.comparisons, params: paramsHl, capacityItems, now: now0, seed: subSeed(MASTER_SEED, `decay-churn-before-${hl}`),
    });
    const before = ratingsBefore.find((r) => r.itemId === escalatedOriginal.id)!.pAboveCutline;

    // Mutate ground truth: the item is now unambiguously the best in the list.
    const churnedWorld: WorldItem[] = world.map((w) => (
      w.id === escalatedOriginal.id ? { ...w, trueTheta: bestTheta + 2 } : w
    ));
    const churnVoter = createSyntheticVoter({ seed: subSeed(MASTER_SEED, `decay-churn-voter-${hl}`), accuracy: 0.87 });

    const maintenance = runSession({
      world: churnedWorld, capacityItems, scoringParams: paramsHl, voter: churnVoter,
      mode: 'adaptive', maxDuels: 10, confidenceTarget: 1.1, // never "reached" -- we just want the 10 duels
      masterSeed: subSeed(MASTER_SEED, `decay-churn-maint-${hl}`),
      seedComparisons: onboarding.comparisons, tapIndexOffset: onboarding.duelsRun, baseTimeMs: now0.getTime(),
    });
    // pull pAboveCutline straight from a fresh computeRatings call on the final comparisons (snapshot only stores confidence/spearman)
    const finalRatings = computeRatings({
      items: churnedWorld, comparisons: maintenance.comparisons, params: paramsHl, capacityItems, now: new Date(now0.getTime() + 11 * 5000), seed: subSeed(MASTER_SEED, `decay-churn-after-${hl}`),
    });
    const after = finalRatings.find((r) => r.itemId === escalatedOriginal.id)!.pAboveCutline;

    churnRows.push([String(hl), before.toFixed(3), after.toFixed(3), (after - before).toFixed(3)]);
  }
  printTable(
    `Experiment 5b: CHURN -- item at true rank ${escalatedOriginal.trueRank} escalated to #1 at day ${churnDays}; pAboveCutline before/after a 10-duel maintenance session, by half-life`,
    ['half-life (days)', 'pAboveCutline before', 'pAboveCutline after 10 duels', 'delta'],
    churnRows,
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('Stack Ranked -- simulation harness (npm run sim)');
  console.log(`Default params (docs/02 §8): ${JSON.stringify(DEFAULT_PARAMS)}`);
  console.log(`Confidence target: ${CONFIDENCE_TARGET}, voter accuracy: 0.87, master seed: ${MASTER_SEED}`);

  const { adaptive, random } = runExperiments123();
  printExperiment1(adaptive);
  printExperiment2(adaptive, random);
  printExperiment3(adaptive, random);

  log('running experiment 4 (fatigue)...');
  runExperiment4();

  log('running experiment 5 (decay half-life)...');
  runExperiment5();

  log('done.');
}

main();
