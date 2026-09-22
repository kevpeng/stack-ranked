/**
 * Shared helpers for the app/api/** route handlers. Owned by @backend.
 * Not a route itself (no exported GET/POST), so Next.js ignores it.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DEFAULT_PARAMS } from '@/lib/types';
import type { ListConfig, ScoringParams } from '@/lib/types';

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Builds the ScoringParams to fit a given list with: defaults, with the
 * list's own capacityItems/decayHalflifeDays overriding (those two are the
 * only per-list overrides this MVP's schema stores — see
 * coord/CONTRACTS.md "Query layer"). */
export function scoringParamsFor(list: ListConfig): ScoringParams {
  return { ...DEFAULT_PARAMS, decayHalflifeDays: list.decayHalflifeDays };
}

/** A seed for this request's fit/selection. Not cryptographic, not tested
 * for reproducibility across requests (only lib/scoring's own tests need
 * that, and they always pass an explicit seed) — just deterministic enough
 * within a single request that computing ratings twice against the same
 * data gives the same answer, and varied enough run to run that repeated
 * GETs don't always sample the identical bootstrap replicate order. */
export function requestSeed(): number {
  return Date.now() ^ (Math.floor(performance.now() * 1000) & 0xffffffff);
}

export const outcomeSchema = z.enum(['a', 'b', 'tie']);
export const strategySchema = z.enum(['placement', 'infogain', 'cutline', 'audit']);
export const tierSchema = z.enum(['now', 'next', 'later', 'never']);

export const voteBodySchema = z.object({
  itemAId: z.string().min(1),
  itemBId: z.string().min(1),
  outcome: outcomeSchema,
  strategy: strategySchema,
  isAudit: z.boolean(),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
});

export const placeBodySchema = z.object({
  itemId: z.string().min(1),
  tier: tierSchema,
});

export const createListBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  capacityItems: z.number().int().positive().optional(),
  fixture: z.boolean().optional(),
});

/** Every route parses its body the same defensive way: invalid JSON is a
 * 400, not a 500. */
export async function parseJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // caller's zod parse will reject this as invalid
  }
}
