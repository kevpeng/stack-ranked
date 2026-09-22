/**
 * List health (docs/02 §6). Owned by @backend.
 */

import type { ComputeListStatus } from './contract';
import { logisticP } from './math';

const MIN_AUDIT_FOR_ACCURACY = 10;
/** How close to 0.5 a predicted probability must be to count a real 'tie'
 * outcome as a correct prediction. */
const TIE_TOLERANCE = 0.1;

export const computeListStatusImpl: ComputeListStatus = (input) => {
  const { ratings, comparisons, params, unplacedCount } = input;

  const placedCount = ratings.length;

  const confidence = placedCount === 0
    ? 0
    : ratings.filter((r) => r.pAboveCutline > params.confidentHi || r.pAboveCutline < params.confidentLo).length
      / placedCount;

  const ratingByItem = new Map(ratings.map((r) => [r.itemId, r]));

  let correct = 0;
  let total = 0;
  for (const c of comparisons) {
    if (!c.isAudit) continue;
    const ra = ratingByItem.get(c.itemAId);
    const rb = ratingByItem.get(c.itemBId);
    if (!ra || !rb) continue; // audit comparison touches an item outside the fitted set

    const p = logisticP(ra.theta, rb.theta); // P(A beats B), from the (audit-excluded) fit
    let isCorrect: boolean;
    if (c.outcome === 'a') isCorrect = p > 0.5;
    else if (c.outcome === 'b') isCorrect = p < 0.5;
    else isCorrect = Math.abs(p - 0.5) < TIE_TOLERANCE;

    total += 1;
    if (isCorrect) correct += 1;
  }

  const auditAccuracy = total >= MIN_AUDIT_FOR_ACCURACY ? correct / total : null;

  return {
    confidence,
    comparisonCount: comparisons.length,
    placedCount,
    unplacedCount,
    auditAccuracy,
  };
};
