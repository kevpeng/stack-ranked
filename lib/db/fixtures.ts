/**
 * Demo seed backlog — owned by @db. Consumed by lib/db/seed.ts.
 *
 * ~60 realistic B2B SaaS backlog items. The ARRAY ORDER below IS the
 * "current tracker order" the product's first-session payoff depends on
 * (docs/03 §1, docs/02 §5): the first ~20 are a genuinely defensible
 * priority list (compliance/reliability/revenue items backed by real
 * evidence, roughly in impact order); everything after that is shuffled —
 * some high-value items buried, some low-value items sitting suspiciously
 * high — because a real backlog decays exactly this way once nobody
 * re-sorts it for six months. That gap is what the duel session is for.
 *
 * `externalSortOrder` is derived from this array's order (see sortOrderFor
 * below) rather than hand-typed, so the two can never drift apart.
 * `externalPriority` (Linear-style 0=none..4=low, here used as
 * 1=urgent..4=low with occasional `null`) is hand-set per item and
 * deliberately inconsistent with true value below the top ~20 — stale or
 * optimistic priority tags are exactly what a neglected backlog looks like.
 */

import type { Evidence, Item, ItemState } from '../types';

interface Fixture {
  externalKey: string;
  title: string;
  summaryLine: string;
  labels: string[];
  estimate: number | null;
  evidence: Evidence;
  /** YYYY-MM-DD, interpreted as UTC midnight. */
  createdAtExternal: string;
  externalPriority: number | null;
}

function f(
  externalKey: string,
  title: string,
  summaryLine: string,
  labels: string[],
  externalPriority: number | null,
  createdAtExternal: string,
  estimate: number | null = null,
  evidence: Evidence = {},
): Fixture {
  return { externalKey, title, summaryLine, labels, externalPriority, createdAtExternal, estimate, evidence };
}

// prettier-ignore
const RAW: Fixture[] = [
  // ---- Top ~20: defensible, roughly in impact order -----------------------
  f('SEC-101', 'SAML SSO for enterprise tier', 'Six enterprise deals worth $340k ARR are stalled in security review because we have no SAML SSO.', ['security'], 1, '2025-11-03', 8, { arr: 340000, customers: 6, requester: 'Dana Okafor', requesterRole: 'VP Sales' }),
  f('ENG-401', 'Multi-region read replicas', 'Three P1 outages this quarter traced to a single-region Postgres primary saturating under read load.', ['infra'], 1, '2025-10-14', 13, {}),
  f('SEC-102', 'SCIM user provisioning', 'Enterprise IT teams are manually adding/removing users because we don’t support SCIM, and two renewals are at risk over it.', ['security'], 1, '2025-11-20', 5, { arr: 210000, customers: 4, requester: 'Marcus Lin', requesterRole: 'Head of IT, Northwind Health' }),
  f('BIZ-501', 'Usage-based billing meter for API calls', 'API usage is metered internally but never billed, leaking an estimated $18k/month across 40 accounts.', ['billing'], 1, '2025-09-02', 8, { arr: 216000, customers: 40 }),
  f('SEC-103', 'Audit log retention controls', 'Our largest customer’s renewal is contingent on 1-year audit log retention with export, due in 6 weeks.', ['security', 'ops'], 2, '2025-12-01', 5, { arr: 180000, customers: 1, requester: 'Priya Chandrasekaran', requesterRole: 'CISO, Fenwick Group' }),
  f('OPS-301', 'Bulk CSV export', 'Bulk export is the #1 support request this quarter — 87 tickets, mostly from ops teams stuck copy-pasting rows by hand.', ['ops'], 2, '2025-08-19', 3, { customers: 87 }),
  f('ENG-402', 'Rate limiting per API key', 'A single misbehaving integration took down the shared API tier for every customer for 40 minutes last month.', ['infra', 'security'], 1, '2025-12-10', 5, {}),
  f('BIZ-502', 'Dunning email sequence for failed payments', 'Failed payments have no retry or notification, silently churning an estimated $9k MRR every month.', ['billing', 'growth'], 2, '2025-09-28', 3, { arr: 108000 }),
  f('GTM-201', 'Self-serve upgrade flow from free to Pro', 'Funnel data shows 22% of free-tier accounts hit a paywall and bounce because upgrading requires emailing sales.', ['growth'], 2, '2025-10-05', 5, { customers: 1200 }),
  f('SEC-104', 'Field-level encryption for PII columns', 'A pending $95k deal’s security addendum requires column-level encryption at rest for customer PII, not just disk encryption.', ['security'], 2, '2026-01-08', 8, { arr: 95000, customers: 1, requester: 'Alicia Ferreira', requesterRole: 'Deal desk' }),
  f('ENG-403', 'Background job queue migration to SQS', 'The in-process job runner drops jobs on deploy — support logs 6-10 "my export never arrived" tickets per release.', ['infra'], 2, '2025-11-11', 8, { customers: 30 }),
  f('BIZ-503', 'Proration for mid-cycle plan changes', 'Plan changes bill the full new amount with no proration, generating a support ticket almost every time a customer upgrades mid-cycle.', ['billing'], 2, '2025-10-22', 5, { customers: 54 }),
  f('OPS-302', 'Customer health score dashboard', 'CS has no way to see at-risk accounts before they churn; three renewals were lost last quarter with no warning.', ['ops', 'growth'], 2, '2025-12-15', 5, { requester: 'Tomas Reyes', requesterRole: 'Head of CS' }),
  f('SEC-105', 'Two-factor auth enforcement for admins', 'A prospect’s security review flagged that admin accounts can be created without any 2FA requirement.', ['security'], 2, '2026-01-15', 3, { arr: 62000, requester: 'Deal desk' }),
  f('GTM-202', 'Onboarding checklist redesign', 'Activation analysis shows accounts that don’t complete onboarding in the first session churn at 3x the rate.', ['growth'], 2, '2025-09-10', 5, { customers: 2400 }),
  f('ENG-404', 'API versioning strategy', 'We’ve shipped two breaking API changes this year with no version header, breaking integrations without warning.', ['infra', 'dx'], 3, '2025-11-25', null, { customers: 15 }),
  f('BIZ-504', 'Tax calculation via Stripe Tax', 'Expansion into 4 new states means we’re now legally required to collect sales tax we currently don’t calculate.', ['billing'], 2, '2026-02-02', 3, {}),
  f('OPS-303', 'Webhook retry with backoff', 'Outbound webhooks fire once with no retry; a downstream 500 means silent data loss customers only notice days later.', ['ops', 'infra'], 2, '2025-10-30', 3, { customers: 22 }),
  f('SEC-106', 'IP allowlisting for admin console', 'A finance-sector prospect requires IP allowlisting on the admin console as a contractual security control.', ['security'], 2, '2026-01-22', 3, { arr: 71000, requester: 'Deal desk' }),
  f('MOB-601', 'Push notifications for mobile app', 'Mobile DAU is 40% of web DAU with zero re-engagement lever; push is the single most requested mobile feature.', ['mobile', 'growth'], 3, '2025-08-01', 5, { customers: 900 }),

  // ---- ~21-60: shuffled, "basically arbitrary" existing order -------------
  f('DX-703', 'GraphQL API beta', 'An internal platform demo used GraphQL and it got tagged urgent, but no external customer has asked for it.', ['dx'], 1, '2026-03-01', 13, {}),
  f('MOB-602', 'Offline mode for mobile checklist', 'Field teams on job sites with no signal lose in-progress checklists; support sees a handful of complaints a month.', ['mobile'], 3, '2025-09-15', 8, { customers: 12 }),
  f('OPS-308', 'Data retention policy enforcement job', 'A $95k renewal’s legal review is blocked on proof that deleted-account data is actually purged within 30 days, not just hidden.', ['ops', 'security'], null, '2025-07-20', 5, { arr: 95000, customers: 1, requester: 'Legal, Halloway Systems' }),
  f('GTM-203', 'In-app referral program', 'No structured referral flow exists despite ~15% of new signups already citing "a colleague" in the signup survey.', ['growth'], 3, '2025-12-20', 5, {}),
  f('BIZ-505', 'Invoice PDF branding', 'Generated invoices use the default template with no company logo; two customers have asked for branding for their own AP systems.', ['billing'], 4, '2025-08-28', 2, { customers: 2 }),
  f('ENG-405', 'Database connection pool tuning', 'Three minor incidents this quarter trace back to connection pool exhaustion under normal traffic, not spikes.', ['infra'], 2, '2026-01-30', 3, {}),
  f('DX-701', 'Public API rate limit docs', 'Rate limits exist but aren’t documented anywhere, so every integrator discovers them by hitting a 429 in production.', ['dx'], 3, '2025-11-05', 1, {}),
  f('OPS-304', 'Bulk user deactivation', 'Ops manually deactivates departed users one at a time; one customer’s offboarding of 40 seats took an afternoon.', ['ops'], 2, '2026-02-10', 2, { customers: 1, requester: 'IT admin, large account' }),
  f('GTM-204', 'Usage-based upsell nudges', 'No in-app prompt exists when an account approaches its plan limit — they just hit a hard wall and file a ticket.', ['growth'], null, '2025-10-18', 3, {}),
  f('MOB-603', 'Biometric login on mobile', 'A handful of app store reviews mention wanting Face ID/fingerprint login instead of re-typing a password each time.', ['mobile'], 3, '2025-09-25', 2, {}),
  f('ENG-406', 'Blue/green deploy pipeline', 'Every deploy has a ~90 second window of mixed old/new instances behind the load balancer; engineering wants it gone.', ['infra'], null, '2026-01-12', 8, {}),
  f('BIZ-506', 'Multi-currency support', 'The EU expansion push has ~$120k of pipeline from prospects who want to be billed in EUR, not USD.', ['billing', 'growth'], 2, '2026-02-18', 8, { arr: 120000 }),
  f('DX-702', 'SDK for Node.js', 'Every Node.js integrator currently hand-rolls fetch calls against the raw API; a handful have asked for an official SDK.', ['dx'], 3, '2025-12-05', 5, { customers: 5 }),
  f('GTM-205', 'Product Qualified Lead scoring', 'Sales has no signal for which free accounts are actually engaged enough to be worth an outbound call.', ['growth'], 3, '2026-01-05', 5, {}),
  f('OPS-305', 'Scheduled report delivery via email', 'A few accounts manually export and email the same report to stakeholders every Monday; asked for it to just be scheduled.', ['ops'], 4, '2025-11-14', 2, { customers: 6 }),
  f('MOB-604', 'Mobile deep linking for shared reports', 'Shared report links open the mobile web view instead of the app even when the app is installed.', ['mobile'], null, '2026-02-25', 2, {}),
  f('ENG-407', 'Structured logging rollout', 'Half the services log unstructured text, making cross-service incident debugging slow and mostly grep-based.', ['infra', 'dx'], 2, '2025-10-27', 5, {}),
  f('DX-704', 'API sandbox environment', 'Three prospective integration partners have separately asked for a sandbox so they can build against fake data before going live.', ['dx'], null, '2025-08-12', 5, { customers: 3, requester: 'Partnerships' }),
  f('GTM-210', 'Dark mode for the web app', 'Dark mode is a recurring one-off request in the feedback widget, with no evidence it affects retention or conversion.', ['growth'], 4, '2025-09-01', 3, {}),
  f('BIZ-507', 'Seat-based billing reconciliation job', 'Finance manually reconciles seat counts against Stripe every month because seat changes don’t sync automatically.', ['billing', 'ops'], 2, '2026-01-18', 3, { requester: 'Finance' }),
  f('OPS-306', 'Zapier integration', 'Ops teams at a few accounts have asked for Zapier to connect us to their existing spreadsheet/Slack workflows.', ['ops', 'dx'], 3, '2025-12-28', 5, { customers: 4 }),
  f('MOB-605', 'Tablet-optimized layout', 'The mobile layout stretches awkwardly on iPad; no specific complaint on file, just looks unpolished in demos.', ['mobile'], 4, '2025-10-08', 3, {}),
  f('GTM-206', 'Free trial extension for engaged accounts', 'Highly engaged trial accounts that need 3-4 more days to get stakeholder buy-in currently just expire and churn.', ['growth'], 3, '2026-02-05', 2, {}),
  f('ENG-408', 'Search reindexing job', 'Search index drifts from source data after bulk edits; a manual reindex script has to be run by an engineer on request.', ['infra'], null, '2025-11-30', 3, {}),
  f('DX-705', 'Improved error messages for API 4xx responses', 'Generic "Bad Request" errors with no field-level detail are the single biggest driver of API support tickets.', ['dx'], 2, '2025-09-20', 3, { customers: 18 }),
  f('SEC-107', 'SOC 2 evidence collection automation', 'Compliance spends ~10 hours a week manually screenshotting evidence for the SOC 2 audit instead of it being automated.', ['security', 'ops'], 2, '2025-07-08', 8, { requester: 'Compliance lead' }),
  f('OPS-307', 'Status page auto-incident posting', 'Incidents are posted to the status page manually, sometimes 20+ minutes after customers start noticing and asking.', ['ops', 'infra'], 3, '2026-01-25', 2, {}),
  f('GTM-207', 'Pricing page A/B test framework', 'There’s no way to test pricing page changes without a full deploy, so the page hasn’t changed in over a year.', ['growth'], null, '2025-12-12', 5, {}),
  f('BIZ-508', 'Credit note issuance flow', 'Refunds and credits are issued manually in Stripe with no record in-app, so support can’t see a customer’s credit history.', ['billing'], 3, '2025-10-02', 3, {}),
  f('MOB-606', 'Mobile app crash reporting integration', 'Crash rate on the mobile app has crept up over two releases and we have no crash reporting to tell us why.', ['mobile', 'infra'], 2, '2026-02-14', 2, {}),
  f('ENG-409', 'Feature flag service adoption', 'Feature rollouts are still config-file-and-redeploy; engineering wants a real flag service to ship behind flags.', ['infra', 'dx'], null, '2025-11-18', 5, {}),
  f('DX-706', 'Postman collection auto-generation', 'The hand-maintained Postman collection is perpetually a few endpoints behind the actual API.', ['dx'], 4, '2025-08-22', 2, {}),
  f('SEC-108', 'Session timeout policy per workspace', 'One security-conscious customer wants configurable session timeouts; currently it’s a single global 30-day value.', ['security'], 3, '2026-01-28', 2, { customers: 1 }),
  f('GTM-208', 'Annual billing discount promo', 'No in-app prompt nudges monthly accounts toward annual billing, which converts better on cash flow for both sides.', ['growth', 'billing'], 4, '2025-09-05', 2, {}),
  f('OPS-309', 'In-app announcement banner tool', 'Every product announcement currently requires an engineer to hardcode a banner and ship a deploy to remove it later.', ['ops'], null, '2026-02-20', 3, {}),
  f('MOB-607', 'App Store review prompt tuning', 'The review prompt fires on first launch before anyone has had a good moment, and average rating has been drifting down.', ['mobile', 'growth'], 4, '2025-12-08', 1, {}),
  f('DX-707', 'Webhooks event catalog page', 'There’s no single page listing which webhook events exist and their payload shapes; integrators reverse-engineer it from support.', ['dx'], 3, '2025-10-12', 2, {}),
  f('GTM-209', 'Team invite flow simplification', 'Inviting a teammate takes 5 steps across two pages; a couple of new accounts have abandoned it partway through.', ['growth'], 2, '2026-01-02', 2, {}),
  f('DX-708', 'CLI tool for bulk operations', 'Power users doing bulk operations currently have to script raw API calls themselves; a couple have asked for an official CLI.', ['dx', 'ops'], null, '2025-11-08', 5, { customers: 2 }),
  f('DX-709', 'OpenAPI spec publishing', 'We maintain OpenAPI internally for our own tooling but never publish it, so third-party client generators can’t be used against our API.', ['dx'], 4, '2026-02-28', 1, {}),
];

const DEFAULT_STATE: ItemState = 'active';

function slug(externalKey: string): string {
  return externalKey.toLowerCase();
}

/**
 * externalSortOrder, derived from RAW's authored order rather than
 * hand-typed so the array order and the sort-order floats can never
 * disagree. Strictly increasing, non-round (mimics a tracker's sortOrder
 * after many manual reorders), never null in this fixture set.
 */
function sortOrderFor(index: number): number {
  const value = 1000 + index * 97.3 + (index % 5) * 3.1;
  return Math.round(value * 10) / 10;
}

/** ~60 realistic B2B SaaS backlog items, in the "current tracker order". */
export const SEED_ITEMS: Item[] = RAW.map((raw, index) => ({
  id: slug(raw.externalKey),
  externalKey: raw.externalKey,
  title: raw.title,
  summaryLine: raw.summaryLine,
  labels: raw.labels,
  estimate: raw.estimate,
  state: DEFAULT_STATE,
  evidence: raw.evidence,
  createdAtExternal: new Date(`${raw.createdAtExternal}T00:00:00.000Z`).toISOString(),
  externalPriority: raw.externalPriority,
  externalSortOrder: sortOrderFor(index),
}));
