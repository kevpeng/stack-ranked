'use client';

import type { Item } from '@/lib/types';
import { EvidenceChips } from './EvidenceChips';
import { Kbd } from './Chip';

export type CardFeedback = 'picked' | 'rejected' | null;

interface DuelCardProps {
  item: Item;
  side: 'a' | 'b';
  onPick: () => void;
  feedback: CardFeedback;
  trackerUrl?: string;
}

/**
 * One side of a duel. Deliberately shows externalKey, title, summaryLine
 * and evidence chips only — NEVER rank or score (docs/01, docs/03: showing
 * position on a duel card is the single most damaging mistake here, since
 * the PO will just pick whichever side already looks "higher" and the
 * model re-learns its own output instead of learning anything new).
 */
export function DuelCard({ item, side, onPick, feedback, trackerUrl }: DuelCardProps) {
  const arrow = side === 'a' ? '←' : '→';
  return (
    <div
      className={`group relative flex flex-col rounded-xl border-2 bg-white p-4 text-left shadow-sm transition-all duration-150 dark:bg-zinc-900 sm:p-5 ${
        feedback === 'picked'
          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
          : feedback === 'rejected'
            ? 'border-zinc-200 opacity-40 dark:border-zinc-800'
            : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{item.externalKey}</span>
        {trackerUrl && (
          <a
            href={trackerUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-zinc-400 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-500 dark:hover:text-zinc-300"
            title="Edit ticket in tracker"
          >
            Edit ticket ↗
          </a>
        )}
      </div>

      <h3 className="mt-1 text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{item.title}</h3>
      <p className="mt-1.5 text-sm leading-snug text-zinc-600 dark:text-zinc-400">{item.summaryLine}</p>

      <EvidenceChips item={item} />

      <button
        type="button"
        onClick={onPick}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:mt-auto"
      >
        {side === 'a' && <Kbd>{arrow}</Kbd>}
        This one
        {side === 'b' && <Kbd>{arrow}</Kbd>}
      </button>
    </div>
  );
}
