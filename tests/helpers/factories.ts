/**
 * Fixture builders for scoring/selection tests. Builds minimal-but-valid
 * `Item` / `Comparison` / `ScoringParams` objects against lib/types.ts so
 * every test file isn't re-deriving boilerplate.
 */
import type {
  Comparison, DuelStrategy, Item, ItemId, Outcome, ScoringParams,
} from '@/lib/types';
import { DEFAULT_PARAMS } from '@/lib/types';

export function makeItem(id: ItemId, overrides: Partial<Item> = {}): Item {
  return {
    id,
    externalKey: `ENG-${id}`,
    title: `Item ${id}`,
    summaryLine: `Summary for ${id}`,
    labels: [],
    estimate: null,
    state: 'active',
    evidence: {},
    createdAtExternal: '2026-01-01T00:00:00.000Z',
    externalPriority: null,
    externalSortOrder: null,
    ...overrides,
  };
}

export function makeItems(n: number, prefix = 'item'): Item[] {
  return Array.from({ length: n }, (_, i) => makeItem(`${prefix}-${i}`));
}

let cmpCounter = 0;

export function makeComparison(overrides: Partial<Comparison> & {
  itemAId: ItemId;
  itemBId: ItemId;
}): Comparison {
  cmpCounter += 1;
  return {
    id: `cmp-${cmpCounter}`,
    listId: 'list-1',
    voterId: 'voter-1',
    outcome: 'a' as Outcome,
    strategy: 'infogain' as DuelStrategy,
    isAudit: false,
    latencyMs: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Every pair from `items` compared once, winner determined by array order (earlier beats later). */
export function roundRobin(items: Item[], opts: Partial<Comparison> = {}): Comparison[] {
  const out: Comparison[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      out.push(makeComparison({ itemAId: items[i].id, itemBId: items[j].id, outcome: 'a', ...opts }));
    }
  }
  return out;
}

export function testParams(overrides: Partial<ScoringParams> = {}): ScoringParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}
