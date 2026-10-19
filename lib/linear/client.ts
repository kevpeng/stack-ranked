/**
 * Minimal Linear GraphQL client.
 *
 * Auth: a PERSONAL API KEY, not OAuth. docs/04 originally specified OAuth2,
 * which was written while multiplayer was in scope. OAuth exists so other
 * people can grant you access; in a single-player tool (docs/00) there are no
 * other people, so a personal key is both simpler and the right shape. OAuth
 * becomes necessary only if this is ever hosted for multiple users.
 *
 * The header gotcha: a personal key goes in `Authorization` with **no Bearer
 * prefix**. `Bearer` is for OAuth tokens, and using it with a personal key
 * fails authentication.
 */

const ENDPOINT = 'https://api.linear.app/graphql';

export class LinearError extends Error {}

export function getApiKey(): string {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    throw new LinearError(
      'LINEAR_API_KEY is not set.\n' +
        '  1. In Linear: Settings -> Security & access -> Personal API keys -> create one\n' +
        '  2. Add it to .env.local (gitignored):  LINEAR_API_KEY=lin_api_...\n' +
        '  Never paste the key into a chat or commit it.',
    );
  }
  if (!key.startsWith('lin_api_')) {
    throw new LinearError(
      `LINEAR_API_KEY does not look like a Linear personal key (expected a "lin_api_" prefix, got "${key.slice(0, 8)}...").\n` +
        '  An OAuth access token will not work here — create a personal API key instead.',
    );
  }
  return key;
}

export async function linearQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  // Resolve the key BEFORE the fetch try/catch. Inside it, a missing-key error
  // would be caught and re-reported as a network failure — which is the most
  // common first-run error wearing the most misleading message.
  const apiKey = getApiKey();

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No "Bearer" — see the note at the top of this file.
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new LinearError(
      `Could not reach ${ENDPOINT}. If you are running inside a restricted network, ` +
        `api.linear.app may need to be allowed.\n  Cause: ${(cause as Error).message}`,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new LinearError(
      `Linear rejected the API key (HTTP ${res.status}). Check that the key is current and was ` +
        'copied whole — Linear shows it only once, so a truncated paste is the usual cause.',
    );
  }
  if (res.status === 429) {
    throw new LinearError('Linear rate limit hit (HTTP 429). Wait a minute and retry.');
  }
  if (!res.ok) {
    throw new LinearError(`Linear returned HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) {
    // Surface the real GraphQL message: a field that does not exist on this
    // workspace's schema shows up here, and the message names it.
    throw new LinearError(`Linear GraphQL error: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  if (!body.data) throw new LinearError('Linear returned no data.');
  return body.data;
}
