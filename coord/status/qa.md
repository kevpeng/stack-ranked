# @qa — status

**State:** in progress
**Last updated:** 2026-09-21 (start)

## Currently editing
Read DASHBOARD.md, CONTRACTS.md, lib/types.ts, lib/scoring/contract.ts,
docs/02-ranking-model.md (§2-6), docs/05-architecture.md Testing section.

Writing tests against contracts (lib/scoring/index.ts, lib/db/queries.ts,
app/api/** do not exist yet except lib/db/schema.ts). Expect red-on-import
until @backend/@db land their files — will note which failures are that vs.
genuine defects.

Plan:
1. tests/unit/scoring.properties.test.ts — dominance, reversal, ties,
   undefeated/winless/zero-comparison finiteness, determinism, decay,
   rank interval sanity, audit exclusion.
2. tests/unit/scoring.recovery.test.ts — noisy-voter recovery vs ground
   truth (Spearman correlation), golden-fixture style.
3. tests/unit/selection.test.ts — selectNextDuel: auditFraction,
   determinism, no repeat-ask, null when confident.
4. tests/integration/api.test.ts — route handlers against PGlite.
5. tests/unit/db.test.ts — queries.ts round-trip.

No fast-check/simple-statistics in node_modules — writing a small seeded
PRNG (mulberry32) and Spearman/Kendall helper inline in test files since
NEVER run npm install. Noted below.

## Done
_(nothing yet)_

## Needs from others
- lib/scoring/index.ts from @backend (contract.ts already gives signatures).
- lib/db/queries.ts, lib/db/client.ts from @db.
- app/api/lists/**, app/api/lists/[id]/** route handlers from @backend.

## Blocked / questions for coordinator
_(nothing yet)_
