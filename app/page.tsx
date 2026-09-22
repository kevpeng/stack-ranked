'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ListConfig } from '@/lib/types';
import * as client from '@/app/_lib/client';

const FIXTURE_OPTIONS = [{ key: 'saas-60', label: 'B2B SaaS backlog · 61 items' }];

export default function HomePage() {
  const router = useRouter();
  const [lists, setLists] = useState<ListConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [fixture, setFixture] = useState(FIXTURE_OPTIONS[0].key);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.listLists();
        if (!cancelled) setLists(res.lists);
      } catch (err) {
        if (!cancelled) setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not load your lists.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setErrorMessage('');
    try {
      const res = await client.createList({ name: name.trim() || undefined, fixture });
      router.push(`/lists/${res.list.id}`);
    } catch (err) {
      setCreating(false);
      setErrorMessage(err instanceof client.ApiError ? err.message : 'Could not create that list.');
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Stack Ranked</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          Answer &ldquo;which ships first?&rdquo; a few dozen times and your backlog comes out ranked.
        </p>

        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Create a list from a fixture</h2>
          <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="list-name" className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Name (optional)
              </label>
              <input
                id="list-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q3 Backlog"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="fixture" className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Fixture
              </label>
              <select
                id="fixture"
                value={fixture}
                onChange={(e) => setFixture(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {FIXTURE_OPTIONS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {creating ? 'Creating…' : 'Create list'}
            </button>
          </form>
        </section>

        {errorMessage && <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{errorMessage}</p>}

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Your lists</h2>
          {loading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : lists.length === 0 ? (
            <p className="text-sm text-zinc-400">No lists yet — create one above.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {lists.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    className="flex items-center justify-between gap-3 bg-white p-4 hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                  >
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{list.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {list.seedOrder.length} items · top {list.capacityItems} ship · created{' '}
                        {new Date(list.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-sm text-zinc-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
