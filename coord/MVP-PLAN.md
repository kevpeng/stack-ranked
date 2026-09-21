# MVP Build Plan

**Definition of the MVP:** seed a list from fixture data, run a duel session,
and see a ranked backlog with a cut line and the seed-vs-settled diff.

That is the thinnest thing that tests the actual product thesis from
`docs/00-vision.md`: *a PO sits for ~180 duels and gets an order better than
what their tracker already had.* Everything not serving that is out.

## In scope

| # | Capability | Owner | Why it's in |
|---|---|---|---|
| 1 | Bradley-Terry engine: MM fit, prior/regularization, decay, bootstrap CIs, confidence | @backend | The product. Without it there's no ranking |
| 2 | Pair selection: placement (binary insertion), infogain, cut-line focus, audit sampling | @backend | What makes ~180 duels enough instead of ~700 |
| 3 | Simulation harness | @backend | Validates the engine offline; turns every tuned parameter from a guess into a measurement (docs/02 §7) |
| 4 | Postgres schema + dual-driver client + query layer | @db | |
| 5 | ~60-item realistic fixture backlog | @db | The demo is only as good as this data |
| 6 | HTTP API (8 routes) | @backend | |
| 7 | Duel session, keyboard-first | @frontend | The atomic unit — if this isn't fast, nothing else matters |
| 8 | List view with cut line | @frontend | Turns an ordering into "these ship, these don't" |
| 9 | Seed-vs-settled diff | @frontend | The first-session payoff (docs/03 §1) |
| 10 | Unplaced queue + placement flow | @frontend | Triage-as-taps |
| 11 | Property + integration tests | @qa | Especially the undefeated-item regression |

## Explicitly out (and why)

- **Real Linear/Jira OAuth** — needs credentials that can't be exercised here.
  The fixture path proves the loop; the tracker adapter slots in behind it later.
- **Order write-back to the tracker** — depends on a live connection.
- **Auth / multi-user** — single hardcoded dev voter. `voterId` is in the schema
  from day one so multiplayer stays additive (docs/08).
- **Slack** — Phase 2 in `docs/06`, and it's a nudge, not the client.
- **Stored `ratings` table** — derived per request instead. Sub-millisecond fit
  at this scale, so a cache would add invalidation work and buy nothing.
- **Pins, applications/undo, audit log, seasons, effort lists** — all Phase 2+.

## Parallelization strategy

The risk with four agents in one repo is collision on shared files. Mitigations,
all applied before dispatch:

1. **All dependencies installed up front.** No agent runs `npm install`, so
   `package.json` and `node_modules` never race.
2. **Contracts written first.** `lib/types.ts`, `lib/scoring/contract.ts`, and
   the API + query-layer signatures in `CONTRACTS.md` were fixed before anyone
   started, so the three integration seams are specified rather than negotiated.
3. **Disjoint file ownership**, enforced by `DASHBOARD.md` RULE 1.
4. **One status file per agent** rather than a shared board — concurrent writes
   to a single dashboard would conflict.
5. **Nobody commits.** The coordinator integrates and commits.

Result: no agent is blocked by any other. @frontend builds against mocked API
shapes, @backend codes against the documented query signatures, @qa writes tests
against the contracts — all before the other side exists.

## Integration sequence (coordinator)

1. Land agent output, resolve any boundary violations
2. `npx tsc --noEmit` clean across the whole repo
3. `npm run db:seed` → real list id
4. `npm test` → triage genuine failures vs. not-yet-landed
5. `npm run sim` → confirm the engine converges and infogain beats random
6. `npx next build` → Vercel-ready
7. Commit + push

## Deploying to Vercel

API routes are Next.js route handlers, so they deploy as Vercel functions with
no extra config. The only deploy-time decision is the database:

- **Zero-config demo:** leave `DATABASE_URL` unset. PGlite persists to disk —
  fine locally, but note Vercel's filesystem is ephemeral, so serverless state
  will not survive between invocations.
- **Real deploy:** set `DATABASE_URL` to Neon or Vercel Postgres. The schema is
  `pg-core`, so it is already Postgres-accurate — no translation needed.
