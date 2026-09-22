/**
 * Onboarding/maintenance session-length estimate — docs/02 §1: budget a
 * session at roughly 3x the item count (2x the information-theoretic
 * floor). 61 items -> ~180 duels. This is a documented product constant,
 * not a mock-only detail, so the duel page's "N of ~180" progress text and
 * the mock engine's own stop condition both derive from this one function.
 */
export function estimateSessionLength(placedItemCount: number): number {
  return Math.max(20, Math.round(placedItemCount * 3));
}

export function trackerUrl(externalKey: string): string {
  return `https://linear.app/demo/issue/${externalKey}`;
}
