'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Duel, Outcome } from '@/lib/types';
import * as client from '@/app/_lib/client';
import { estimateSessionLength, trackerUrl } from '@/app/_lib/session';
import { DuelCard, type CardFeedback } from '@/components/DuelCard';
import { ProgressBar } from '@/components/ProgressBar';
import { Kbd } from '@/components/Chip';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

export default function DuelSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: listId } = use(params);
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [listName, setListName] = useState('');
  const [duel, setDuel] = useState<Duel | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [approxTotal, setApproxTotal] = useState(180);
  const [confidence, setConfidence] = useState(0);
  const [feedback, setFeedback] = useState<{ a: CardFeedback; b: CardFeedback }>({ a: null, b: null });

  const submittingRef = useRef(false);
  const cardShownAtRef = useRef<number>(0);
  const duelRef = useRef<Duel | null>(null);
  duelRef.current = duel;

  const showDuel = useCallback((next: Duel | null) => {
    setDuel(next);
    setFeedback({ a: null, b: null });
    cardShownAtRef.current = performance.now();
  }, []);

  // Initial load: current status (to resume the running duel count honestly)
  // plus the first duel to show.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [listRes, duelRes] = await Promise.all([client.getList(listId), client.getDuel(listId)]);
        if (cancelled) return;
        setListName(listRes.list.name);
        setAnsweredCount(listRes.status.comparisonCount);
        setApproxTotal(estimateSessionLength(Math.max(listRes.status.placedCount, 1)));
        setConfidence(listRes.status.confidence);
        if (!duelRes.duel) {
          setLoadState('empty');
          return;
        }
        showDuel(duelRes.duel);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  const decide = useCallback(
    async (outcome: Outcome) => {
      const current = duelRef.current;
      if (!current || submittingRef.current) return;
      submittingRef.current = true;

      const latencyMs = Math.round(performance.now() - cardShownAtRef.current);
      // Optimistic feedback fires immediately — we do not wait on the
      // network to react. Only swapping in the *next* pair waits on data,
      // and that round trip is the one thing the backend targets <300ms.
      setFeedback(
        outcome === 'tie'
          ? { a: null, b: null }
          : outcome === 'a'
            ? { a: 'picked', b: 'rejected' }
            : { a: 'rejected', b: 'picked' },
      );

      try {
        const res = await client.vote(listId, {
          itemAId: current.itemA.id,
          itemBId: current.itemB.id,
          outcome,
          strategy: current.strategy,
          isAudit: current.isAudit,
          latencyMs,
        });
        setAnsweredCount((n) => n + 1);
        setConfidence(res.status.confidence);
        setApproxTotal(estimateSessionLength(Math.max(res.status.placedCount, 1)));
        submittingRef.current = false;
        if (!res.nextDuel) {
          router.push(`/lists/${listId}/diff`);
          return;
        }
        showDuel(res.nextDuel);
      } catch (err) {
        submittingRef.current = false;
        setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not record that vote — try again.');
      }
    },
    [listId, router, showDuel],
  );

  const skip = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const res = await client.getDuel(listId);
      submittingRef.current = false;
      if (!res.duel) {
        router.push(`/lists/${listId}/diff`);
        return;
      }
      showDuel(res.duel);
    } catch (err) {
      submittingRef.current = false;
      setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not fetch another pair.');
    }
  }, [listId, router, showDuel]);

  // Keyboard-first (docs/01): arrows pick a side, space = too close to
  // call, s = skip. This is the difference between finishing 180 duels and
  // quitting at 40, so it is wired at the window level, not per-button.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          void decide('a');
          break;
        case 'ArrowRight':
          e.preventDefault();
          void decide('b');
          break;
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          void decide('tie');
          break;
        case 's':
        case 'S':
          e.preventDefault();
          void skip();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [decide, skip]);

  if (loadState === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-400">Loading duel session…</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-50 px-4 dark:bg-zinc-950">
        <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage}</p>
        <Link href={`/lists/${listId}`} className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300">
          Back to list
        </Link>
      </main>
    );
  }

  if (loadState === 'empty' || !duel) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-50 px-4 text-center dark:bg-zinc-950">
        <p className="text-lg font-medium text-zinc-700 dark:text-zinc-200">Nothing to duel right now.</p>
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          Every placed item is confidently ranked, or there aren&apos;t enough placed items yet. Try the unplaced queue.
        </p>
        <div className="mt-2 flex gap-3">
          <Link href={`/lists/${listId}`} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Back to list
          </Link>
          <Link href={`/lists/${listId}/unplaced`} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900">
            Unplaced queue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:py-10">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/lists/${listId}`} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              ← {listName || 'List'}
            </Link>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Stop anytime — progress is saved as you go</span>
          </div>
          <ProgressBar duelIndex={answeredCount} approxTotal={approxTotal} confidence={confidence} />
        </header>

        <h1 className="mb-5 text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:mb-6 sm:text-2xl">
          Which ships first?
        </h1>

        {errorMessage && (
          <p className="mb-4 text-center text-sm text-rose-600 dark:text-rose-400">{errorMessage}</p>
        )}

        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <DuelCard item={duel.itemA} side="a" onPick={() => void decide('a')} feedback={feedback.a} trackerUrl={trackerUrl(duel.itemA.externalKey)} />
          <DuelCard item={duel.itemB} side="b" onPick={() => void decide('b')} feedback={feedback.b} trackerUrl={trackerUrl(duel.itemB.externalKey)} />
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 sm:mt-8 sm:flex-row sm:justify-center sm:gap-4">
          <button
            type="button"
            onClick={() => void decide('tie')}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Kbd>space</Kbd> Too close to call
          </button>
          <button
            type="button"
            onClick={() => void skip()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Kbd>s</Kbd> Skip
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          <Kbd>←</Kbd> left card &nbsp; <Kbd>→</Kbd> right card &nbsp; <Kbd>space</Kbd> too close &nbsp; <Kbd>s</Kbd> skip
        </p>
      </div>
    </main>
  );
}
