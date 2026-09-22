/**
 * In-memory mock "backend" — implements the shapes in coord/CONTRACTS.md
 * using app/_mock/engine.ts. Runs client-side only (module-level singleton
 * in the browser tab); state resets on a full page reload by design. A demo
 * list is auto-seeded on first use so the app is never empty.
 *
 * app/_lib/client.ts is the only place that should import this module.
 */
import type { Duel, Item, ItemId, ListConfig, ListDiff, ListId, ListStatus, Outcome, Rating, Tier } from '@/lib/types';
import { FIXTURES, getFixture } from './fixtures';
import {
  applyVote as engineApplyVote,
  beginPlacement,
  createListRuntime,
  deriveSeedOrder,
  recompute,
  selectGeneralDuel,
  buildDiff,
  type ListRuntime,
} from './engine';

const lists = new Map<ListId, ListRuntime>();
let listIdCounter = 0;
let seeded = false;

function nextListId(): ListId {
  listIdCounter += 1;
  return `list-${listIdCounter}`;
}

function ensureSeedDemo() {
  if (seeded) return;
  seeded = true;
  createListFromFixture({ name: 'Q3 Backlog', fixture: 'saas-60' });
}

export interface CreateListInput {
  name?: string;
  capacityItems?: number;
  fixture?: string;
}

export function createListFromFixture(input: CreateListInput): ListConfig {
  const fixtureDef = getFixture(input.fixture ?? FIXTURES[0].key);
  const items = fixtureDef.build();
  const seedOrder = deriveSeedOrder(items);
  const capacityItems = input.capacityItems ?? fixtureDef.capacityItems;

  const config: ListConfig = {
    id: nextListId(),
    name: input.name?.trim() || fixtureDef.label,
    capacityItems,
    decayHalflifeDays: 90,
    seedOrder,
    createdAt: new Date().toISOString(),
  };

  // Reserve a handful of the most-recently-created items as "just arrived"
  // inbound requests that haven't been ranked yet — populates Unplaced on
  // creation so that screen is demo-able immediately (docs/01 §Intake).
  const byAge = [...items].sort(
    (a, b) => new Date(b.createdAtExternal).getTime() - new Date(a.createdAtExternal).getTime(),
  );
  const initiallyUnplaced = new Set<ItemId>(byAge.slice(0, Math.min(5, Math.floor(items.length * 0.1))).map((i) => i.id));

  const runtime = createListRuntime(config, items, initiallyUnplaced);
  lists.set(config.id, runtime);
  return config;
}

export function listAllLists(): ListConfig[] {
  ensureSeedDemo();
  return [...lists.values()].map((rt) => rt.config).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getListRuntime(id: ListId): ListRuntime | null {
  ensureSeedDemo();
  return lists.get(id) ?? null;
}

export interface GetListResult {
  list: ListConfig;
  items: Item[];
  ratings: Rating[];
  status: ListStatus;
}

export function getList(id: ListId): GetListResult | null {
  const rt = getListRuntime(id);
  if (!rt) return null;
  const { ratings, status } = recompute(rt);
  const items = [...rt.itemsById.values()].map((i) => i.item);
  return { list: rt.config, items, ratings, status };
}

export function getDuel(listId: ListId): Duel | null {
  const rt = getListRuntime(listId);
  if (!rt) return null;
  return selectGeneralDuel(rt);
}

export interface VoteInputBody {
  itemAId: ItemId;
  itemBId: ItemId;
  outcome: Outcome;
  strategy: Duel['strategy'];
  isAudit: boolean;
  latencyMs: number | null;
}

export interface VoteResponse {
  ratings: Rating[];
  status: ListStatus;
  nextDuel: Duel | null;
}

export function vote(listId: ListId, input: VoteInputBody): VoteResponse | null {
  const rt = getListRuntime(listId);
  if (!rt) return null;
  const { ratings, status, nextDuel } = engineApplyVote(rt, input);
  return { ratings, status, nextDuel };
}

export function getUnplaced(listId: ListId): Item[] {
  const rt = getListRuntime(listId);
  if (!rt) return [];
  return [...rt.itemsById.values()].filter((i) => !i.placed).map((i) => i.item);
}

export interface PlaceResponse {
  duel: Duel | null;
  placed: boolean;
}

export function place(listId: ListId, itemId: ItemId, tier: Tier): PlaceResponse | null {
  const rt = getListRuntime(listId);
  if (!rt) return null;
  const duel = beginPlacement(rt, itemId, tier);
  const item = rt.itemsById.get(itemId);
  return { duel, placed: item ? item.placed : false };
}

export function getDiff(listId: ListId): ListDiff | null {
  const rt = getListRuntime(listId);
  if (!rt) return null;
  return buildDiff(rt, rt.config.seedOrder);
}
