/**
 * Thin API client — the ONLY place pages/components talk to "the backend".
 *
 * Every function's signature and return shape matches coord/CONTRACTS.md
 * exactly. Right now USE_MOCK routes everything to app/_mock/store.ts (a
 * client-side simulation); flip USE_MOCK to false once @backend's
 * app/api/** routes land and every call below switches to real `fetch`
 * with zero changes needed in any page or component.
 */
import type { Duel, DuelStrategy, Item, ItemId, ListConfig, ListDiff, ListId, ListStatus, Outcome, Rating, Tier } from '@/lib/types';
import * as mock from '../_mock/store';

export const USE_MOCK = true;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function realFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

function notFound(listId: ListId): never {
  throw new ApiError(`List ${listId} not found`, 404);
}

export interface CreateListInput {
  name?: string;
  capacityItems?: number;
  fixture?: string;
}
export interface CreateListResponse {
  list: ListConfig;
}
export async function createList(input: CreateListInput): Promise<CreateListResponse> {
  if (!USE_MOCK) return realFetch('/api/lists', { method: 'POST', body: JSON.stringify(input) });
  return { list: mock.createListFromFixture(input) };
}

export interface ListListsResponse {
  lists: ListConfig[];
}
export async function listLists(): Promise<ListListsResponse> {
  if (!USE_MOCK) return realFetch('/api/lists');
  return { lists: mock.listAllLists() };
}

export interface GetListResponse {
  list: ListConfig;
  items: Item[];
  ratings: Rating[];
  status: ListStatus;
}
export async function getList(id: ListId): Promise<GetListResponse> {
  if (!USE_MOCK) return realFetch(`/api/lists/${id}`);
  const result = mock.getList(id);
  if (!result) notFound(id);
  return result;
}

export interface GetDuelResponse {
  duel: Duel | null;
}
export async function getDuel(id: ListId): Promise<GetDuelResponse> {
  if (!USE_MOCK) return realFetch(`/api/lists/${id}/duel`);
  const rt = mock.getListRuntime(id);
  if (!rt) notFound(id);
  return { duel: mock.getDuel(id) };
}

export interface VoteInput {
  itemAId: ItemId;
  itemBId: ItemId;
  outcome: Outcome;
  strategy: DuelStrategy;
  isAudit: boolean;
  latencyMs: number | null;
}
export interface VoteResponse {
  ratings: Rating[];
  status: ListStatus;
  nextDuel: Duel | null;
}
export async function vote(id: ListId, input: VoteInput): Promise<VoteResponse> {
  if (!USE_MOCK) return realFetch(`/api/lists/${id}/vote`, { method: 'POST', body: JSON.stringify(input) });
  const result = mock.vote(id, input);
  if (!result) notFound(id);
  return result;
}

export interface GetUnplacedResponse {
  items: Item[];
}
export async function getUnplaced(id: ListId): Promise<GetUnplacedResponse> {
  if (!USE_MOCK) return realFetch(`/api/lists/${id}/unplaced`);
  const rt = mock.getListRuntime(id);
  if (!rt) notFound(id);
  return { items: mock.getUnplaced(id) };
}

export interface PlaceInput {
  itemId: ItemId;
  tier: Tier;
}
export interface PlaceResponse {
  duel: Duel | null;
  placed: boolean;
}
export async function place(id: ListId, input: PlaceInput): Promise<PlaceResponse> {
  if (!USE_MOCK) return realFetch(`/api/lists/${id}/place`, { method: 'POST', body: JSON.stringify(input) });
  const result = mock.place(id, input.itemId, input.tier);
  if (!result) notFound(id);
  return result;
}

export interface GetDiffResponse {
  diff: ListDiff;
}
export async function getDiff(id: ListId): Promise<GetDiffResponse> {
  if (!USE_MOCK) return realFetch(`/api/lists/${id}/diff`);
  const diff = mock.getDiff(id);
  if (!diff) notFound(id);
  return { diff };
}
