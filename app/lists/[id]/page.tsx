'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ListConfig, ListDiff, ListStatus, Rating } from '@/lib/types';
import * as client from '@/app/_lib/client';
import { confidenceBars, formatPercent, movementClass, movementLabel, ratingConfidence } from '@/app/_lib/format';

type LoadState = 'loading' | 'ready' | 'error';

export default function ListViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: listId } = use(params);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [list, setList] = useState<ListConfig | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [titlesById, setTitlesById] = useState<Map<string, { title: string; externalKey: string }>>(new Map());
  const [status, setStatus] = useState<ListStatus | null>(null);
  const [diff, setDiff] = useState<ListDiff | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [listRes, diffRes] = await Promise.all([client.getList(listId), client.getDiff(listId)]);
        if (cancelled) return;
        setList(listRes.list);
        setStatus(listRes.status);
        setRatings([...listRes.ratings].sort((a, b) => a.rank - b.rank));
        setTitlesById(new Map(listRes.items.map((it) => [it.id, { title: it.title, externalKey: it.externalKey }])));
        setDiff(diffRes.diff);
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not load this list.');
        setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listId]);

  if (loadState === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-400">Loading list…</p>
      </main>
    );
  }

  if (loadState === 'error' || !list || !status) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-50 px-4 dark:bg-zinc-950">
        <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage || 'List not found.'}</p>
        <Link href="/" className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300">
          Back home
        </Link>
      </main>
    );
  }

  const deltaByItemId = new Map((diff?.rows ?? []).map((r) => [r.itemId, r.delta]));
  const totalPlaced = ratings.length;
  const cutlineRevealed = status.comparisonCount >= totalPlaced * 1.5 && totalPlaced > 0;
  const uncertainCount = ratings.filter((r) => r.pAboveCutline > 0.05 && r.pAboveCutline < 0.95).length;

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <div className="mb-1 flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← All lists
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{list.name}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {totalPlaced} items · {formatPercent(status.confidence)} confident · {status.unplacedCount} unplaced
              {status.auditAccuracy !== null && <> · {formatPercent(status.auditAccuracy)} self-consistent</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/lists/${listId}/duel`}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {status.comparisonCount === 0 ? 'Start duel session' : 'Continue duels'}
            </Link>
            <button
              type="button"
              disabled
              title="Write-back isn't wired up yet"
              className="cursor-not-allowed rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-400 dark:border-zinc-700 dark:text-zinc-600"
            >
              Apply to Linear
            </button>
          </div>
        </div>

        {!cutlineRevealed && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <strong className="font-semibold">Seeded — {formatPercent(status.confidence)} confident.</strong> This order comes
            from your tracker, not your judgment yet. The cut line below is provisional until a duel session settles it.
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100/60 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 font-medium">Conf</th>
                <th className="px-4 py-2.5 font-medium">Move</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((r, idx) => {
                const meta = titlesById.get(r.itemId);
                const delta = deltaByItemId.get(r.itemId) ?? 0;
                const rows = [
                  <tr key={r.itemId} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/60">
                    <td className="px-4 py-2.5 tabular-nums text-zinc-400 dark:text-zinc-500">{r.rank}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{meta?.title ?? r.itemId}</div>
                      <div className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
                        {meta?.externalKey} · #{r.rankLo}–#{r.rankHi} · {r.comparisonCount} duel{r.comparisonCount === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{r.score}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs tracking-tight text-zinc-500 dark:text-zinc-400" title={`${formatPercent(ratingConfidence(r.pAboveCutline))} decisive`}>
                        {confidenceBars(ratingConfidence(r.pAboveCutline))}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums font-medium ${movementClass(delta)}`} title="vs. your original tracker order">
                      {movementLabel(delta)}
                    </td>
                  </tr>,
                ];
                if (idx + 1 === list.capacityItems && idx + 1 < ratings.length) {
                  rows.push(
                    <tr key="cutline">
                      <td colSpan={5} className="bg-zinc-900 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
                        Cut line · {list.capacityItems} of {ratings.length} ship this cycle
                        {!cutlineRevealed && ' (provisional)'}
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })}
              {ratings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                    Nothing placed yet.{' '}
                    <Link href={`/lists/${listId}/unplaced`} className="underline">
                      Place some items
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/lists/${listId}/unplaced`}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {status.unplacedCount} unplaced
          </Link>
          <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            {uncertainCount} still uncertain
          </span>
          <Link
            href={`/lists/${listId}/diff`}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            See the diff
          </Link>
        </div>
      </div>
    </main>
  );
}
