/**
 * Mock fixture data — a realistic-looking B2B SaaS backlog used to develop
 * and demo every screen before @backend's real routes / @db's real seed
 * data exist. Not shared with lib/db (owned by @db); this is FE-only.
 *
 * Deterministic (seeded RNG) so the fixture set is stable across renders —
 * it's only re-generated per browser session (see app/_mock/store.ts).
 */
import type { Evidence, Item, Tier } from '@/lib/types';

/** Small, seeded PRNG (mulberry32) so fixture data is stable, not random noise. */
function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function maybe<T>(rand: () => number, p: number, val: () => T): T | undefined {
  return rand() < p ? val() : undefined;
}

interface AnchorSpec {
  key: string;
  title: string;
  summaryLine: string;
  labels: string[];
  estimate: number | null;
  priorityHint: 0 | 1 | 2 | 3 | 4;
}

/** Hand-authored, high-signal items — these carry the top and middle of the demo list. */
const ANCHORS: AnchorSpec[] = [
  { key: 'FEAT-402', title: 'SSO for enterprise tier', summaryLine: '3 enterprise deals list SAML as a hard blocker', labels: ['security', 'enterprise'], estimate: 13, priorityHint: 1 },
  { key: 'FEAT-118', title: 'Bulk CSV export', summaryLine: 'Ops re-keys data by hand every Monday, ~6h/week', labels: ['ops', 'export'], estimate: 3, priorityHint: 2 },
  { key: 'FEAT-233', title: 'Onboarding checklist v2', summaryLine: 'Activation drops 40% between signup and first project', labels: ['onboarding', 'activation'], estimate: 8, priorityHint: 1 },
  { key: 'FEAT-089', title: 'Usage-based billing', summaryLine: 'Top 5 accounts want metered pricing, not seats', labels: ['billing'], estimate: 13, priorityHint: 2 },
  { key: 'FEAT-301', title: 'Audit log', summaryLine: 'Security review requires a tamper-evident action log', labels: ['security', 'compliance'], estimate: 8, priorityHint: 2 },
  { key: 'FEAT-176', title: 'Mobile push notifications', summaryLine: 'Support tickets close 2x faster when users get pushed alerts', labels: ['mobile'], estimate: 5, priorityHint: 3 },
  { key: 'FEAT-512', title: 'Custom dashboards', summaryLine: 'Every enterprise demo asks "can I build my own view"', labels: ['analytics'], estimate: 13, priorityHint: 2 },
  { key: 'BUG-771', title: 'Webhook retries silently drop after 3 failures', summaryLine: 'Two customers lost order events during a provider outage', labels: ['reliability', 'api'], estimate: 3, priorityHint: 1 },
  { key: 'FEAT-244', title: 'Role-based permissions', summaryLine: 'Agencies need client-view seats that can’t see billing', labels: ['security', 'enterprise'], estimate: 8, priorityHint: 2 },
  { key: 'FEAT-390', title: 'Slack notifications', summaryLine: 'Requested in every churn interview from the last quarter', labels: ['integrations'], estimate: 3, priorityHint: 3 },
  { key: 'FEAT-055', title: 'Dark mode', summaryLine: 'Top feature request on the public roadmap board, 340 votes', labels: ['ui'], estimate: 5, priorityHint: 4 },
  { key: 'FEAT-268', title: 'API rate limit increase for partners', summaryLine: 'Our biggest integration partner hits 429s during their peak hour', labels: ['api', 'partners'], estimate: 2, priorityHint: 2 },
  { key: 'FEAT-421', title: 'In-app product tour', summaryLine: 'New admins can’t find the settings that matter in week one', labels: ['onboarding'], estimate: 5, priorityHint: 3 },
  { key: 'FEAT-337', title: 'Saved filters and views', summaryLine: 'Power users rebuild the same filter every session', labels: ['ui', 'productivity'], estimate: 3, priorityHint: 3 },
  { key: 'BUG-654', title: 'Timezone bug in scheduled reports', summaryLine: 'Reports land an hour off for any customer east of UTC', labels: ['bug', 'reporting'], estimate: 2, priorityHint: 2 },
  { key: 'FEAT-488', title: 'Two-factor authentication', summaryLine: 'Security questionnaire flags 2FA as missing on every enterprise RFP', labels: ['security'], estimate: 5, priorityHint: 1 },
  { key: 'FEAT-199', title: 'Public status page', summaryLine: 'Every incident this year got asked about individually over email', labels: ['reliability', 'support'], estimate: 3, priorityHint: 3 },
  { key: 'FEAT-350', title: 'Bulk edit for tickets', summaryLine: 'Support triages 80 tickets a day one at a time', labels: ['support', 'productivity'], estimate: 5, priorityHint: 3 },
  { key: 'FEAT-462', title: 'Data residency (EU region)', summaryLine: 'Two EU prospects worth $180k ARR require in-region storage', labels: ['compliance', 'enterprise'], estimate: 13, priorityHint: 2 },
  { key: 'FEAT-142', title: 'Onboarding checklist for admins', summaryLine: 'Admin-specific setup steps get buried in the generic tour', labels: ['onboarding'], estimate: 3, priorityHint: 3 },
  { key: 'BUG-812', title: 'CSV import fails silently on >10k rows', summaryLine: 'Large-account migrations quietly drop rows past the limit', labels: ['bug', 'import'], estimate: 3, priorityHint: 2 },
  { key: 'FEAT-275', title: 'Zapier integration', summaryLine: 'Long tail of small customers ask for "just get me into Zapier"', labels: ['integrations'], estimate: 5, priorityHint: 4 },
  { key: 'FEAT-503', title: 'Custom domains for customer portal', summaryLine: 'White-label resellers need the portal on their own domain', labels: ['enterprise'], estimate: 8, priorityHint: 3 },
  { key: 'FEAT-081', title: 'Keyboard shortcuts throughout app', summaryLine: 'Power users explicitly compare us unfavorably to Superhuman-style tools', labels: ['productivity', 'ui'], estimate: 5, priorityHint: 4 },
  { key: 'FEAT-360', title: 'Multi-currency invoicing', summaryLine: 'Three international deals are stuck on USD-only billing', labels: ['billing', 'enterprise'], estimate: 8, priorityHint: 2 },
  { key: 'FEAT-217', title: 'Read-only API keys', summaryLine: 'Security teams won’t approve full-access keys for reporting tools', labels: ['api', 'security'], estimate: 2, priorityHint: 3 },
  { key: 'FEAT-407', title: 'In-app changelog', summaryLine: 'Support fields "did you change X" tickets we already shipped notes for', labels: ['support'], estimate: 2, priorityHint: 4 },
  { key: 'FEAT-291', title: 'Team activity feed', summaryLine: 'Managers can’t see what changed across their team without asking', labels: ['collaboration'], estimate: 5, priorityHint: 3 },
  { key: 'BUG-905', title: 'Search misses results with special characters', summaryLine: 'Any ticket title with a slash or dash silently drops from search', labels: ['bug', 'search'], estimate: 3, priorityHint: 2 },
  { key: 'FEAT-155', title: 'Scheduled data exports to S3', summaryLine: 'Data team hand-runs the same export every morning', labels: ['export', 'ops'], estimate: 5, priorityHint: 3 },
];

const FILLER_VERBS = ['Add', 'Improve', 'Fix', 'Rework', 'Simplify', 'Speed up', 'Clean up', 'Document', 'Consolidate', 'Harden'];
const FILLER_NOUNS = [
  'the settings page', 'the notification center', 'the billing portal', 'search relevance',
  'the mobile nav', 'onboarding emails', 'the admin console', 'the API docs',
  'the help center', 'the report builder', 'the activity log UI', 'the invite flow',
  'error messages', 'the empty states', 'the loading states', 'the file uploader',
  'the comments UI', 'the tagging system', 'the archive flow', 'the duplicate detector',
  'the pricing page', 'the trial banner', 'the usage meter', 'the sandbox environment',
  'the CLI', 'the webhook UI', 'the audit export', 'the SSO setup flow',
  'the permissions matrix', 'the notification preferences',
];
const FILLER_LABEL_POOL = ['ui', 'infra', 'support', 'growth', 'tech-debt', 'reporting', 'api', 'productivity'];

const KEY_PREFIXES = ['ENG', 'FEAT', 'OPS', 'SUP'];

const REQUESTERS: { name: string; role: string }[] = [
  { name: 'Sam', role: 'AE' },
  { name: 'Priya', role: 'PM' },
  { name: 'Dana', role: 'CS' },
  { name: 'Marcus', role: 'Eng' },
  { name: 'Legal', role: 'Legal' },
  { name: 'Wei', role: 'Support' },
  { name: 'Jordan', role: 'Sales' },
  { name: 'Ada', role: 'Security' },
  { name: 'Leo', role: 'Founder' },
  { name: 'Nina', role: 'CSM' },
];

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function buildEvidence(rand: () => number, priorityHint: number): Evidence {
  const hasRequester = rand() < 0.85;
  const req = hasRequester ? pick(rand, REQUESTERS) : undefined;
  const enterprisey = priorityHint <= 2 && rand() < 0.55;
  return {
    arr: maybe(rand, enterprisey ? 0.6 : 0.15, () => Math.round((20 + rand() * 300)) * 1000),
    customers: maybe(rand, enterprisey ? 0.55 : 0.2, () => Math.round(1 + rand() * 12)),
    requester: req?.name,
    requesterRole: req?.role,
  };
}

function estimateFromRand(rand: () => number): number | null {
  if (rand() < 0.12) return null;
  return pick(rand, [1, 2, 3, 5, 8, 13]);
}

/** Builds the full ~61-item seeded backlog for the "saas-60" fixture. */
function buildSaasBacklog(): Item[] {
  const rand = mulberry32(20260921);
  const items: Item[] = [];
  let counter = 1;

  for (const a of ANCHORS) {
    const ageDays = Math.round(3 + rand() * 260);
    items.push({
      id: `saas-${counter}`,
      externalKey: a.key,
      title: a.title,
      summaryLine: a.summaryLine,
      labels: a.labels,
      estimate: a.estimate,
      state: 'active',
      evidence: buildEvidence(rand, a.priorityHint),
      createdAtExternal: daysAgoISO(ageDays),
      externalPriority: a.priorityHint,
      externalSortOrder: null, // assigned below
    });
    counter += 1;
  }

  const fillerCount = 61 - ANCHORS.length;
  for (let i = 0; i < fillerCount; i += 1) {
    const verb = pick(rand, FILLER_VERBS);
    const noun = pick(rand, FILLER_NOUNS);
    const prefix = pick(rand, KEY_PREFIXES);
    const priorityHint = pick(rand, [2, 3, 3, 4, 4, 0] as const);
    const ageDays = Math.round(5 + rand() * 380);
    const label1 = pick(rand, FILLER_LABEL_POOL);
    const label2 = rand() < 0.4 ? pick(rand, FILLER_LABEL_POOL) : null;
    items.push({
      id: `saas-${counter}`,
      externalKey: `${prefix}-${100 + counter}`,
      title: `${verb} ${noun}`,
      summaryLine: `Raised by ${pick(rand, REQUESTERS).name} after recurring confusion in support threads`,
      labels: label2 && label2 !== label1 ? [label1, label2] : [label1],
      estimate: estimateFromRand(rand),
      state: 'active',
      evidence: buildEvidence(rand, priorityHint),
      createdAtExternal: daysAgoISO(ageDays),
      externalPriority: priorityHint,
      externalSortOrder: null,
    });
    counter += 1;
  }

  // externalSortOrder mimics a hand-dragged Linear order: NOT the same as
  // priority (POs drag things around inconsistently) — shuffle lightly
  // around a priority-biased base so the seed order is imperfect on purpose.
  const withJitter = items.map((it) => ({
    item: it,
    key: (it.externalPriority ?? 5) * 100 + rand() * 260,
  }));
  withJitter.sort((x, y) => x.key - y.key);
  withJitter.forEach((w, idx) => {
    w.item.externalSortOrder = idx * 10;
  });

  return items;
}

export interface FixtureDef {
  key: string;
  label: string;
  description: string;
  capacityItems: number;
  build: () => Item[];
}

export const FIXTURES: FixtureDef[] = [
  {
    key: 'saas-60',
    label: 'B2B SaaS backlog',
    description: '61 items seeded from a Linear-style priority + manual order — the reference demo backlog.',
    capacityItems: 22,
    build: buildSaasBacklog,
  },
];

export function getFixture(key: string): FixtureDef {
  const found = FIXTURES.find((f) => f.key === key);
  return found ?? FIXTURES[0];
}

export const TIERS: Tier[] = ['now', 'next', 'later', 'never'];
