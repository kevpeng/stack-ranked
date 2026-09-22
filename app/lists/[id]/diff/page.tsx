'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { DiffRow, ListConfig, ListDiff } from '@/lib/types';
import * as client from '@/app/_lib/client';
import { movementClass, movementLabel } from '@/app/_lib/format';

type LoadState = 'loading' | 'ready' | 'error';

export default function DiffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: listId } = use(params);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [list, setList] = useState<ListConfig | null>(null);
  const [diff, setDiff] = useState<ListDiff | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [listRes, diffRes] = await Promise.all([client.getList(listId), client.getDiff(listId)]);
        if (cancelled) return;
        setList(listRes.list);
        setDiff(diffRes.diff);
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not load the diff.');
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
        <p className="text-sm text-zinc-400">Comparing your seed order to your judgment…</p>
      </main>
    );
  }

  if (loadState === 'error' || !list || !diff) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-50 px-4 dark:bg-zinc-950">
        <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage || 'Diff not available.'}</p>
        <Link href={`/lists/${listId}`} className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300">
          Back to list
        </Link>
      </main>
    );
  }

  const cap = list.capacityItems;
  const promoted = diff.rows.filter((r) => r.seedRank > cap && r.settledRank <= cap);
  const demoted = diff.rows.filter((r) => r.seedRank <= cap && r.settledRank > cap);
  const sortedByImpact = [...diff.rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const hasSignal = diff.totalCount > 0;

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <Link href={`/lists/${listId}`} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← {list.name}
        </Link>

        {!hasSignal ? (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">Nothing placed yet — there&apos;s no judgment to compare against the seed order.</p>
            <Link href={`/lists/${listId}/duel`} className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900">
              Start a duel session
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-zinc-900 sm:p-8">
              <p className="text-lg leading-relaxed text-zinc-800 dark:text-zinc-100 sm:text-xl">
                Your stored order and your judgment disagree on{' '}
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {diff.movedCount} of {diff.totalCount}
                </span>{' '}
                items.
              </p>
              {promoted.length > 0 && (
                <p className="mt-3 text-base text-zinc-700 dark:text-zinc-300">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{promoted.length}</span> item
                  {promoted.length === 1 ? '' : 's'} you had below the cut line belong above it.
                </p>
              )}
              {demoted.length > 0 && (
                <p className="mt-1 text-base text-zinc-700 dark:text-zinc-300">
                  <span className="font-bold text-rose-700 dark:text-rose-400">{demoted.length}</span> item
                  {demoted.length === 1 ? '' : 's'} you had above the cut line actually belong below it.
                </p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MoverCard label="Biggest riser" row={diff.biggestRiser} tone="up" />
              <MoverCard label="Biggest faller" row={diff.biggestFaller} tone="down" />
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-100/60 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">Item</th>
                    <th className="px-4 py-2.5 font-medium">Seed #</th>
                    <th className="px-4 py-2.5 font-medium">Settled #</th>
                    <th className="px-4 py-2.5 font-medium">Move</th>
                    <th className="px-4 py-2.5 font-medium">Cut line</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByImpact.map((r) => (
                    <tr key={r.itemId} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/60">
                      <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{r.title}</td>
                      <td className="px-4 py-2.5 tabular-nums text-zinc-500 dark:text-zinc-400">#{r.seedRank}</td>
                      <td className="px-4 py-2.5 tabular-nums text-zinc-500 dark:text-zinc-400">#{r.settledRank}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${movementClass(r.delta)}`}>{movementLabel(r.delta)}</td>
                      <td className="px-4 py-2.5">
                        {r.crossedCutline && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                            crossed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-6 flex justify-center">
          <Link href={`/lists/${listId}`} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200">
            View the ranked list
          </Link>
        </div>
      </div>
    </main>
  );
}

function MoverCard({ label, row, tone }: { label: string; row: DiffRow | null; tone: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      {row ? (
        <>
          <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{row.title}</p>
          <p className={`mt-1 text-sm font-medium ${tone === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            #{row.seedRank} → #{row.settledRank}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-zinc-400">Not enough movement yet.</p>
      )}
    </div>
  );
}
