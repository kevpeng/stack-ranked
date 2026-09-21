/**
 * HTTP contract tests, exercising route handlers directly against PGlite
 * (see coord/CONTRACTS.md "HTTP API" + "Database"). No running server, no
 * DATABASE_URL.
 *
 * ASSUMPTION (not fully pinned down by CONTRACTS.md): a freshly created,
 * fixture-seeded list may or may not offer a duel immediately, depending on
 * whether items still need to go through the placement flow first. `ensureDuel`
 * below handles either case: it asks for a duel directly, and if that comes
 * back null, drives the /place + /vote placement loop for unplaced items
 * until one becomes available. If this assumption is wrong, see
 * coord/status/qa.md.
 */
import { describe, expect, it } from 'vitest';
import type { Duel, Item, ListDiff, Rating } from '@/lib/types';
import { ctx, findForbiddenKeys, getRequest, jsonRequest, readJson } from '@/tests/helpers/http';

// Route handlers, imported directly per the task brief.
import { GET as listListsRoute, POST as createListRoute } from '@/app/api/lists/route';
import { GET as getListRoute } from '@/app/api/lists/[id]/route';
import { GET as getDuelRoute } from '@/app/api/lists/[id]/duel/route';
import { POST as voteRoute } from '@/app/api/lists/[id]/vote/route';
import { GET as getUnplacedRoute } from '@/app/api/lists/[id]/unplaced/route';
import { POST as placeRoute } from '@/app/api/lists/[id]/place/route';
import { GET as getDiffRoute } from '@/app/api/lists/[id]/diff/route';

function uniqueName(label: string): string {
  return `qa-api-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDuel(listId: string): Promise<Duel> {
  let res = await getDuelRoute(getRequest(`/api/lists/${listId}/duel`), ctx({ id: listId }));
  let body = await readJson(res);
  if (body.duel) return body.duel as Duel;

  const unplacedRes = await getUnplacedRoute(getRequest(`/api/lists/${listId}/unplaced`), ctx({ id: listId }));
  const unplacedBody = await readJson(unplacedRes);
  const unplaced: Item[] = unplacedBody.items ?? [];

  for (const item of unplaced) {
    let guard = 0;
    let placeRes = await placeRoute(
      jsonRequest(`/api/lists/${listId}/place`, 'POST', { itemId: item.id, tier: 'now' }),
      ctx({ id: listId }),
    );
    let placeBody = await readJson(placeRes);
    while (placeBody?.duel && guard < 10) {
      guard++;
      const d: Duel = placeBody.duel;
      await voteRoute(
        jsonRequest(`/api/lists/${listId}/vote`, 'POST', {
          itemAId: d.itemA.id, itemBId: d.itemB.id, outcome: 'a', strategy: d.strategy, isAudit: d.isAudit, latencyMs: 1200,
        }),
        ctx({ id: listId }),
      );
      placeRes = await placeRoute(
        jsonRequest(`/api/lists/${listId}/place`, 'POST', { itemId: item.id, tier: 'now' }),
        ctx({ id: listId }),
      );
      placeBody = await readJson(placeRes);
    }

    res = await getDuelRoute(getRequest(`/api/lists/${listId}/duel`), ctx({ id: listId }));
    body = await readJson(res);
    if (body.duel) return body.duel as Duel;
  }

  throw new Error(
    'No duel became available even after placing every unplaced item — placement/duel wiring assumption may be wrong; see coord/status/qa.md.',
  );
}

async function setupListWithDuel(capacityItems = 5): Promise<{ listId: string; items: Item[]; duel: Duel }> {
  const name = uniqueName('setup');
  const createRes = await createListRoute(jsonRequest('/api/lists', 'POST', { name, capacityItems }));
  expect(createRes.status).toBeLessThan(300);
  const createBody = await readJson(createRes);
  const listId: string = createBody.list.id;

  const getRes = await getListRoute(getRequest(`/api/lists/${listId}`), ctx({ id: listId }));
  const getBody = await readJson(getRes);
  const items: Item[] = getBody.items;
  expect(items.length).toBeGreaterThan(1);

  const duel = await ensureDuel(listId);
  return { listId, items, duel };
}

describe('POST /api/lists + GET /api/lists/:id — create and fetch', () => {
  it('creates a list seeded from fixture data and reads it back', async () => {
    const name = uniqueName('create');
    const createRes = await createListRoute(jsonRequest('/api/lists', 'POST', { name, capacityItems: 5 }));
    expect(createRes.status).toBeLessThan(300);
    const createBody = await readJson(createRes);
    expect(createBody.list.name).toBe(name);
    expect(createBody.list.id).toBeTruthy();

    const getRes = await getListRoute(getRequest(`/api/lists/${createBody.list.id}`), ctx({ id: createBody.list.id }));
    expect(getRes.status).toBeLessThan(300);
    const getBody = await readJson(getRes);
    expect(getBody.list.id).toBe(createBody.list.id);
    expect(Array.isArray(getBody.items)).toBe(true);
    expect(Array.isArray(getBody.ratings)).toBe(true);
    expect(getBody.ratings.length).toBe(getBody.items.length);
    expect(getBody.status).toBeTruthy();
    expect(typeof getBody.status.comparisonCount).toBe('number');
  });

  it('GET /api/lists includes a freshly created list', async () => {
    const { listId } = await setupListWithDuel();
    const res = await listListsRoute(getRequest('/api/lists'));
    expect(res.status).toBeLessThan(300);
    const body = await readJson(res);
    expect(Array.isArray(body.lists)).toBe(true);
    expect(body.lists.some((l: { id: string }) => l.id === listId)).toBe(true);
  });

  it('GET /api/lists/:id/unplaced returns an item array', async () => {
    const { listId } = await setupListWithDuel();
    const res = await getUnplacedRoute(getRequest(`/api/lists/${listId}/unplaced`), ctx({ id: listId }));
    expect(res.status).toBeLessThan(300);
    const body = await readJson(res);
    expect(Array.isArray(body.items)).toBe(true);
  });
});

describe('GET /api/lists/:id/duel — anchoring guard', () => {
  it('a Duel response never contains rank or score fields (docs/01, docs/03)', async () => {
    const { listId } = await setupListWithDuel();
    const res = await getDuelRoute(getRequest(`/api/lists/${listId}/duel`), ctx({ id: listId }));
    expect(res.status).toBeLessThan(300);
    const body = await readJson(res);
    expect(body.duel).toBeTruthy();
    expect(findForbiddenKeys(body.duel)).toEqual([]);
  });
});

describe('POST /api/lists/:id/vote — the hot path', () => {
  it('records a comparison, moves ratings, and increments status.comparisonCount', async () => {
    const { listId, duel } = await setupListWithDuel();

    const beforeRes = await getListRoute(getRequest(`/api/lists/${listId}`), ctx({ id: listId }));
    const before = await readJson(beforeRes);
    const beforeCount: number = before.status.comparisonCount;
    const beforeByItem = new Map<string, Rating>(before.ratings.map((r: Rating) => [r.itemId, r]));

    const voteRes = await voteRoute(
      jsonRequest(`/api/lists/${listId}/vote`, 'POST', {
        itemAId: duel.itemA.id, itemBId: duel.itemB.id, outcome: 'a', strategy: duel.strategy, isAudit: duel.isAudit, latencyMs: 1500,
      }),
      ctx({ id: listId }),
    );
    expect(voteRes.status).toBeLessThan(300);
    const voteBody = await readJson(voteRes);

    expect(voteBody.status.comparisonCount).toBe(beforeCount + 1);

    const afterA = voteBody.ratings.find((r: Rating) => r.itemId === duel.itemA.id);
    const afterB = voteBody.ratings.find((r: Rating) => r.itemId === duel.itemB.id);
    expect(afterA).toBeDefined();
    expect(afterB).toBeDefined();
    expect(afterA.theta).not.toBe(beforeByItem.get(duel.itemA.id)?.theta);
    expect(afterB.theta).not.toBe(beforeByItem.get(duel.itemB.id)?.theta);

    if (voteBody.nextDuel) {
      expect(findForbiddenKeys(voteBody.nextDuel)).toEqual([]);
    }
  });

  it('double-submit guard: two identical rapid votes are not both recorded', async () => {
    const { listId, duel } = await setupListWithDuel();
    const payload = {
      itemAId: duel.itemA.id, itemBId: duel.itemB.id, outcome: 'a', strategy: duel.strategy, isAudit: duel.isAudit, latencyMs: 900,
    };

    const first = await voteRoute(jsonRequest(`/api/lists/${listId}/vote`, 'POST', payload), ctx({ id: listId }));
    expect(first.status).toBeLessThan(300);
    const firstBody = await readJson(first);

    const second = await voteRoute(jsonRequest(`/api/lists/${listId}/vote`, 'POST', payload), ctx({ id: listId }));
    expect(second.status).toBeLessThan(500); // dedupe should never 500

    // Authoritative check: re-fetch the list and confirm only one comparison landed.
    const finalRes = await getListRoute(getRequest(`/api/lists/${listId}`), ctx({ id: listId }));
    const finalBody = await readJson(finalRes);
    expect(finalBody.status.comparisonCount).toBe(firstBody.status.comparisonCount);
  });
});

describe('GET /api/lists/:id/diff — seed-vs-settled', () => {
  it('returns sane, complete diff data', async () => {
    const { listId, items } = await setupListWithDuel();
    const res = await getDiffRoute(getRequest(`/api/lists/${listId}/diff`), ctx({ id: listId }));
    expect(res.status).toBeLessThan(300);
    const body = await readJson(res);
    const diff: ListDiff = body.diff;

    expect(diff.totalCount).toBe(items.length);
    expect(diff.rows).toHaveLength(items.length);
    expect(diff.movedCount).toBeGreaterThanOrEqual(0);
    expect(diff.movedCount).toBeLessThanOrEqual(diff.totalCount);
    expect(diff.crossedCutlineCount).toBeGreaterThanOrEqual(0);
    expect(diff.crossedCutlineCount).toBeLessThanOrEqual(diff.totalCount);

    const seenIds = new Set(diff.rows.map((r) => r.itemId));
    expect(seenIds.size).toBe(items.length);

    for (const row of diff.rows) {
      expect(row.seedRank).toBeGreaterThanOrEqual(1);
      expect(row.seedRank).toBeLessThanOrEqual(items.length);
      expect(row.settledRank).toBeGreaterThanOrEqual(1);
      expect(row.settledRank).toBeLessThanOrEqual(items.length);
      expect(Math.abs(row.delta)).toBe(Math.abs(row.seedRank - row.settledRank));
    }
  });
});

describe('bad input returns 4xx, not 500', () => {
  it('POST /api/lists rejects a malformed body', async () => {
    const res = await createListRoute(jsonRequest('/api/lists', 'POST', { capacityItems: 'not-a-number' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await readJson(res);
    expect(typeof body.error).toBe('string');
  });

  it('GET /api/lists/:id returns 4xx (not 500) for an unknown id', async () => {
    const res = await getListRoute(getRequest('/api/lists/not-a-real-id'), ctx({ id: 'not-a-real-id' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('POST vote with missing required fields returns 4xx', async () => {
    const { listId } = await setupListWithDuel();
    const res = await voteRoute(
      jsonRequest(`/api/lists/${listId}/vote`, 'POST', { itemAId: 'x' }),
      ctx({ id: listId }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('POST vote against a non-existent list returns 4xx, not 500', async () => {
    const res = await voteRoute(
      jsonRequest('/api/lists/does-not-exist/vote', 'POST', {
        itemAId: 'a', itemBId: 'b', outcome: 'a', strategy: 'infogain', isAudit: false, latencyMs: 100,
      }),
      ctx({ id: 'does-not-exist' }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('POST place with a bad tier returns 4xx', async () => {
    const { listId, items } = await setupListWithDuel();
    const res = await placeRoute(
      jsonRequest(`/api/lists/${listId}/place`, 'POST', { itemId: items[0].id, tier: 'whenever' }),
      ctx({ id: listId }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
