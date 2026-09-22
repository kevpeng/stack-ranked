'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Duel, Item, Outcome, Tier } from '@/lib/types';
import * as client from '@/app/_lib/client';
import { trackerUrl } from '@/app/_lib/session';
import { EvidenceChips } from '@/components/EvidenceChips';
import { DuelCard, type CardFeedback } from '@/components/DuelCard';
import { Kbd } from '@/components/Chip';

type View = 'list' | 'tier-select' | 'placing' | 'done';
type LoadState = 'loading' | 'ready' | 'error';

const TIER_META: { tier: Tier; label: string; hint: string }[] = [
  { tier: 'now', label: 'Now', hint: 'top of the list' },
  { tier: 'next', label: 'Next', hint: 'up soon' },
  { tier: 'later', label: 'Later', hint: 'on the list, not urgent' },
  { tier: 'never', label: 'Never', hint: 'archive — one tap, no duels' },
];

export default function UnplacedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: listId } = use(params);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [listName, setListName] = useState('');
  const [items, setItems] = useState<Item[]>([]);

  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Item | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [duel, setDuel] = useState<Duel | null>(null);
  const [feedback, setFeedback] = useState<{ a: CardFeedback; b: CardFeedback }>({ a: null, b: null });
  const [result, setResult] = useState<{ rank: number; total: number; above?: string; below?: string; archived: boolean } | null>(null);

  const submittingRef = useRef(false);
  const cardShownAtRef = useRef(0);

  const loadUnplaced = useCallback(async () => {
    try {
      const [listRes, unplacedRes] = await Promise.all([client.getList(listId), client.getUnplaced(listId)]);
      setListName(listRes.list.name);
      setItems(unplacedRes.items);
      setLoadState('ready');
    } catch (err) {
      setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not load the unplaced queue.');
      setLoadState('error');
    }
  }, [listId]);

  useEffect(() => {
    void loadUnplaced();
  }, [loadUnplaced]);

  function openItem(item: Item) {
    setSelected(item);
    setSelectedTier(null);
    setView('tier-select');
  }

  async function chooseTier(tier: Tier) {
    if (!selected || submittingRef.current) return;
    submittingRef.current = true;
    setSelectedTier(tier);
    try {
      const res = await client.place(listId, { itemId: selected.id, tier });
      submittingRef.current = false;
      if (!res.duel) {
        await finishPlacement(selected, tier === 'never');
        return;
      }
      setDuel(res.duel);
      setFeedback({ a: null, b: null });
      cardShownAtRef.current = performance.now();
      setView('placing');
    } catch (err) {
      submittingRef.current = false;
      setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not start placement.');
    }
  }

  const decide = useCallback(
    async (outcome: Outcome) => {
      if (!duel || !selected || submittingRef.current) return;
      submittingRef.current = true;
      const latencyMs = Math.round(performance.now() - cardShownAtRef.current);
      setFeedback(
        outcome === 'tie' ? { a: null, b: null } : outcome === 'a' ? { a: 'picked', b: 'rejected' } : { a: 'rejected', b: 'picked' },
      );
      try {
        const res = await client.vote(listId, {
          itemAId: duel.itemA.id,
          itemBId: duel.itemB.id,
          outcome,
          strategy: duel.strategy,
          isAudit: duel.isAudit,
          latencyMs,
        });
        submittingRef.current = false;
        if (!res.nextDuel) {
          await finishPlacement(selected, false);
          return;
        }
        setDuel(res.nextDuel);
        setFeedback({ a: null, b: null });
        cardShownAtRef.current = performance.now();
      } catch (err) {
        submittingRef.current = false;
        setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not record that vote — try again.');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duel, selected, listId],
  );

  async function finishPlacement(item: Item, archived: boolean) {
    try {
      const listRes = await client.getList(listId);
      const rating = listRes.ratings.find((r) => r.itemId === item.id);
      const byRank = new Map(listRes.ratings.map((r) => [r.rank, r.itemId]));
      const titleById = new Map(listRes.items.map((it) => [it.id, it.title]));
      const above = rating && rating.rank > 1 ? titleById.get(byRank.get(rating.rank - 1) ?? '') : undefined;
      const below = rating ? titleById.get(byRank.get(rating.rank + 1) ?? '') : undefined;
      setResult({
        rank: rating?.rank ?? listRes.ratings.length,
        total: listRes.ratings.length,
        above,
        below,
        archived,
      });
    } catch {
      setResult({ rank: 0, total: 0, archived });
    }
    setView('done');
    void loadUnplaced();
  }

  function backToList() {
    setView('list');
    setSelected(null);
    setSelectedTier(null);
    setDuel(null);
    setResult(null);
  }

  // Keyboard support during a placement duel — same vocabulary as the main
  // session (arrows to pick, space for a tie). Skip doesn't apply mid
  // binary-search.
  useEffect(() => {
    if (view !== 'placing') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void decide('a');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void decide('b');
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        void decide('tie');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, decide]);

  if (loadState === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-400">Loading unplaced queue…</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-50 px-4 dark:bg-zinc-950">
        <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage}</p>
        <Link href={`/lists/${listId}`} className="text-sm text-zinc-500 underline">
          Back to list
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <Link href={`/lists/${listId}`} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← {listName || 'List'}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Unplaced <span className="text-zinc-400 dark:text-zinc-600">({items.length})</span>
        </h1>

        {errorMessage && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{errorMessage}</p>}

        {view === 'list' && (
          <div className="mt-6">
            {items.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="text-lg font-medium text-emerald-800 dark:text-emerald-300">Unplaced is empty. Nice.</p>
                <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-400/80">Every inbound request has a position.</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 bg-white p-4 dark:bg-zinc-900">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{item.externalKey}</span>
                      </div>
                      <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{item.title}</p>
                      <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{item.summaryLine}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Place
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {view === 'tier-select' && selected && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <button type="button" onClick={backToList} className="mb-3 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              ← choose a different item
            </button>
            <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{selected.externalKey}</span>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{selected.title}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{selected.summaryLine}</p>
            <EvidenceChips item={selected} />

            <p className="mt-5 mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Coarse tier — then a few duels to fine-tune:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIER_META.map((t) => (
                <button
                  key={t.tier}
                  type="button"
                  onClick={() => void chooseTier(t.tier)}
                  disabled={selectedTier !== null}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    t.tier === 'never'
                      ? 'border-zinc-300 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                      : 'border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                  } disabled:cursor-wait disabled:opacity-50`}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'placing' && duel && (
          <div className="mt-6">
            <p className="mb-3 text-center text-sm text-zinc-500 dark:text-zinc-400">Which ships first?</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DuelCard item={duel.itemA} side="a" onPick={() => void decide('a')} feedback={feedback.a} trackerUrl={trackerUrl(duel.itemA.externalKey)} />
              <DuelCard item={duel.itemB} side="b" onPick={() => void decide('b')} feedback={feedback.b} trackerUrl={trackerUrl(duel.itemB.externalKey)} />
            </div>
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void decide('tie')}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Kbd>space</Kbd> Too close to call
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-600">
              <Kbd>←</Kbd> left &nbsp; <Kbd>→</Kbd> right &nbsp; <Kbd>space</Kbd> too close
            </p>
          </div>
        )}

        {view === 'done' && selected && result && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
            {result.archived ? (
              <p className="text-lg font-medium text-emerald-800 dark:text-emerald-300">
                {selected.externalKey} archived. One less thing in the queue.
              </p>
            ) : (
              <>
                <p className="text-lg font-medium text-emerald-800 dark:text-emerald-300">
                  {selected.externalKey} → #{result.rank} of {result.total}
                </p>
                {(result.above || result.below) && (
                  <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                    {result.above && <>Above &lsquo;{result.above}&rsquo;</>}
                    {result.above && result.below && ', '}
                    {result.below && <>below &lsquo;{result.below}&rsquo;</>}
                  </p>
                )}
              </>
            )}
            <button
              type="button"
              onClick={backToList}
              className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Back to unplaced
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
