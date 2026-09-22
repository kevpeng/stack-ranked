import { formatPercent } from '@/app/_lib/format';

interface ProgressBarProps {
  duelIndex: number;
  approxTotal: number;
  confidence: number; // 0..1 — the bar fill is driven by THIS, not duelIndex (docs/03 §2)
}

export function ProgressBar({ duelIndex, approxTotal, confidence }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return (
    <div className="flex w-full items-center gap-3">
      <span className="shrink-0 tabular-nums text-sm text-zinc-500 dark:text-zinc-400">
        {duelIndex} of ~{approxTotal}
      </span>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Confidence"
        className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right tabular-nums text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {formatPercent(confidence)}
      </span>
    </div>
  );
}
