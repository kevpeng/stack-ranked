/**
 * Tiny helpers for exercising Next.js App Router route handlers directly
 * (no running server needed — see coord/CONTRACTS.md / task brief).
 *
 * Route handlers on Next 15 receive `{ params: Promise<{...}> }` for dynamic
 * segments (async params, a breaking change from Next 14), matching the
 * `next: ^15.1.3` pin in package.json.
 */

const ORIGIN = 'http://localhost:3000';

export function jsonRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function getRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`, { method: 'GET' });
}

/**
 * Next 15 dynamic-route context: params is a Promise.
 *
 * Generic in the param shape so it satisfies each handler's specific
 * signature (e.g. `{ params: Promise<{ id: string }> }`). A plain
 * `Record<string, string>` is not assignable to those, because a Record
 * carries no guarantee that `id` is present.
 */
export function ctx<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

export async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(`Response body was not valid JSON (status ${res.status}): ${text.slice(0, 300)}`);
  }
}

/** Recursively asserts no object in this JSON tree carries a `rank` or `score` key. */
export function findForbiddenKeys(value: unknown, path = '$'): string[] {
  const hits: string[] = [];
  if (value === null || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findForbiddenKeys(v, `${path}[${i}]`)));
    return hits;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'rank' || key === 'score' || key === 'rankLo' || key === 'rankHi') {
      hits.push(`${path}.${key}`);
    }
    hits.push(...findForbiddenKeys(v, `${path}.${key}`));
  }
  return hits;
}
