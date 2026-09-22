/** Small formatting helpers shared across duel/list/diff/unplaced screens. */

export function formatArr(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}

export function formatAge(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 1) return 'today';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/**
 * Decorative week-ish label from a story-point estimate. Estimate is never
 * used in scoring (lib/types.ts) — this exists purely so the duel card can
 * show something evocative of effort, matching the docs/01 wireframe
 * ("~1w", "~4w") without pretending points map precisely to time.
 */
export function estimateLabel(points: number): string {
  if (points <= 2) return '~2d';
  if (points <= 3) return '~1w';
  if (points <= 5) return '~1w';
  if (points <= 8) return '~2w';
  return '~4w';
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** 0..1 "how decisive" a rating is — used for the 3-bar confidence glyph. */
export function ratingConfidence(pAboveCutline: number): number {
  return Math.abs(pAboveCutline - 0.5) * 2;
}

export function confidenceBars(conf: number): string {
  const filled = Math.max(0, Math.min(3, Math.round(conf * 3)));
  return '█'.repeat(filled) + '░'.repeat(3 - filled);
}

export function movementLabel(delta: number): string {
  if (delta === 0) return '—';
  return delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`;
}

export function movementClass(delta: number): string {
  if (delta === 0) return 'text-zinc-400 dark:text-zinc-500';
  return delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
