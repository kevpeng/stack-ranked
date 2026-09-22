/**
 * SCORING ENGINE — owned by @backend. Implements lib/scoring/contract.ts.
 *
 * Pure functions only: no DB imports, no I/O, no bare Math.random() (see
 * lib/scoring/prng.ts). Implements docs/02 — see coord/status/backend.md
 * for the design decisions not spelled out in contract.ts (tier bucketing,
 * the strategy tag for maintenance duels, the seed-prior phantom, etc).
 */

import type {
  FitBradleyTerry,
  ComputeRatings,
  SelectNextDuel,
  NextPlacementDuel,
  ComputeListStatus,
} from './contract';
import { buildCompArrays, mmFit } from './fit';
import { computeRatingsImpl } from './bootstrap';
import { selectNextDuelImpl } from './selection';
import { nextPlacementDuelImpl } from './placement';
import { computeListStatusImpl } from './status';

export const fitBradleyTerry: FitBradleyTerry = (input) => {
  const ca = buildCompArrays(input);
  const theta = mmFit(
    ca.n,
    ca.priorKappa,
    ca.seedTheta0,
    ca.seedWeight,
    ca.compA,
    ca.compB,
    ca.compWeight,
    ca.compWinA,
  );
  const out = new Map<string, number>();
  for (let i = 0; i < ca.n; i++) out.set(ca.ids[i], Math.log(theta[i]));
  return out;
};

export const computeRatings: ComputeRatings = (input) => computeRatingsImpl(input);

export const selectNextDuel: SelectNextDuel = (input) => selectNextDuelImpl(input);

export const nextPlacementDuel: NextPlacementDuel = (input) => nextPlacementDuelImpl(input);

export const computeListStatus: ComputeListStatus = (input) => computeListStatusImpl(input);
