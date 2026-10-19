/**
 * Fetch Linear issues and map them to our domain `Item` shape.
 * Field mapping follows the table in docs/04.
 */

import { linearQuery } from './client';
import type { Evidence, Item, ItemState } from '../types';

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

interface RawIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  estimate: number | null;
  sortOrder: number | null;
  createdAt: string;
  url: string;
  state: { name: string; type: string } | null;
  team: { id: string; key: string } | null;
  project: { id: string; name: string } | null;
  labels: { nodes: { name: string }[] };
  creator: { name: string | null; email: string | null } | null;
}

/** Lightweight team listing for the `linear:check` preflight. */
export async function fetchTeams(): Promise<LinearTeam[]> {
  const data = await linearQuery<{
    teams: { nodes: { id: string; key: string; name: string }[] };
  }>(`query Teams { teams(first: 100) { nodes { id key name } } }`);
  return data.teams.nodes;
}

export async function fetchViewer(): Promise<{ name: string; email: string }> {
  const data = await linearQuery<{ viewer: { name: string; email: string } }>(
    `query Viewer { viewer { name email } }`,
  );
  return data.viewer;
}

const ISSUES_QUERY = `
  query Issues($filter: IssueFilter, $after: String) {
    issues(filter: $filter, first: 100, after: $after) {
      nodes {
        id identifier title description priority estimate sortOrder createdAt url
        state { name type }
        team { id key }
        project { id name }
        labels { nodes { name } }
        creator { name email }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/**
 * Pull every issue matching a team key, paging through the connection.
 *
 * Only *open* issues are imported: completed and canceled work is not a
 * prioritization decision any more. `includeCompleted` overrides that.
 */
export async function fetchIssues(opts: {
  teamKey?: string;
  includeCompleted?: boolean;
  limit?: number;
}): Promise<Item[]> {
  const filter: Record<string, unknown> = {};
  if (opts.teamKey) filter.team = { key: { eq: opts.teamKey } };
  if (!opts.includeCompleted) {
    filter.state = { type: { nin: ['completed', 'canceled'] } };
  }

  const out: RawIssue[] = [];
  let after: string | undefined;
  for (;;) {
    const data = await linearQuery<{
      issues: { nodes: RawIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
    }>(ISSUES_QUERY, { filter, after });
    out.push(...data.issues.nodes);
    if (opts.limit && out.length >= opts.limit) return out.slice(0, opts.limit).map(toItem);
    if (!data.issues.pageInfo.hasNextPage) break;
    after = data.issues.pageInfo.endCursor;
  }
  return out.map(toItem);
}

/**
 * Derive the single line shown on a duel card (docs/01).
 *
 * Linear descriptions are markdown and frequently empty or a wall of text.
 * Take the first substantive line, strip the obvious markdown, and cap it.
 * Returns an empty string when there is nothing usable — the caller reports
 * those as un-duelable rather than shipping a card nobody can judge.
 */
export function deriveSummaryLine(description: string | null): string {
  if (!description) return '';
  for (const raw of description.split('\n')) {
    const line = raw
      .replace(/^#+\s*/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/[*_`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim();
    if (line.length < 12) continue; // skip headings, bullets, stray fragments
    if (/^!\[/.test(line) || /^https?:\/\//.test(line)) continue; // bare image/link
    return line.length > 180 ? `${line.slice(0, 177)}...` : line;
  }
  return '';
}

function mapState(type: string | undefined): ItemState {
  if (type === 'completed') return 'completed';
  if (type === 'canceled') return 'canceled';
  return 'active';
}

function toItem(raw: RawIssue): Item {
  const evidence: Evidence = {};
  // Linear has no native ARR/customer-count fields, so evidence stays thin.
  // The requester is the one thing we can always populate honestly.
  if (raw.creator?.name) evidence.requester = raw.creator.name;

  return {
    id: raw.id,
    externalKey: raw.identifier,
    title: raw.title,
    summaryLine: deriveSummaryLine(raw.description),
    labels: raw.labels.nodes.map((l) => l.name),
    estimate: raw.estimate ?? null,
    state: mapState(raw.state?.type),
    evidence,
    createdAtExternal: raw.createdAt,
    // Linear priority: 0 = none, 1 = urgent ... 4 = low. 0 means "unset", which
    // is not the same as "most urgent", so it maps to null rather than 0.
    externalPriority: raw.priority && raw.priority > 0 ? raw.priority : null,
    externalSortOrder: raw.sortOrder ?? null,
  };
}
