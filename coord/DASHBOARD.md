# Build Dashboard — Stack Ranked MVP

**Coordinator:** Opus (orchestrating session)
**Agents:** @backend, @db, @frontend, @qa — all sonnet-high, running in parallel
**Target:** runnable MVP — seed a list, run a duel session, see a ranked
backlog with a cut line and the seed-vs-settled diff.

---

## RULE 1 — File ownership is absolute

Write **only** inside your globs. If you need something changed outside them,
**do not edit it** — write the request into your own status file and keep going
on something else. The coordinator resolves it.

| Glob | Owner | Notes |
|---|---|---|
| `lib/types.ts` | **coordinator** | Shared contract. Read-only for everyone. |
| `lib/scoring/contract.ts` | **coordinator** | Engine signatures. Read-only. |
| `coord/CONTRACTS.md` | **coordinator** | Read-only. |
| `coord/DASHBOARD.md` | **coordinator** | Read-only. |
| `package.json`, `tsconfig.json`, `*.config.*` | **coordinator** | **Never run `npm install`.** All deps are already installed. Need one? Ask in your status file. |
| `lib/db/**` | **@db** | schema, client, queries, seed/fixtures |
| `lib/scoring/**` (except contract.ts) | **@backend** | |
| `lib/sim/**` | **@backend** | |
| `app/api/**` | **@backend** | |
| `app/**` (NOT `app/api`) | **@frontend** | pages, layout, globals.css |
| `components/**` | **@frontend** | |
| `tests/**` | **@qa** | |
| `coord/status/<you>.md` | **you** | your own file only |

## RULE 2 — Check before you assume

Before touching anything near a boundary, read the other agents' status files:

```
cat coord/status/*.md
```

They say what each agent is actively editing right now.

## RULE 3 — Update your status file as you go

Keep `coord/status/<you>.md` current: what you're working on, what you've
finished, what you need from others, what you're blocked on. Other agents rely
on it to stay out of your way. Update it when you start, when a milestone
lands, and when you finish.

## RULE 4 — Never break the shared build

- `npx tsc --noEmit` must pass on your files before you declare done.
- Do not edit another agent's files to fix a type error. Report it instead.
- Do not `git commit`, `git push`, or create branches. The coordinator commits.

## RULE 5 — Read the design docs

`docs/02` (the model) and `docs/05` (schema + architecture) are the spec. The
section references in the contracts are load-bearing — follow them rather than
reinventing. Particular traps called out there:

- **Undefeated/winless items must not diverge** (docs/02 §3.2). Every item is in
  that state on its first placement.
- **Never show rank or score on a duel card** (docs/01, docs/03). Anchoring
  silently destroys the data.
- **Comparisons are append-only.** Never UPDATE or DELETE one.
- **Keep `seedOrder` forever** — it powers the diff, which is the product's
  whole first-session payoff.

---

## Status at a glance

Agents: update your own file, not this table. The coordinator refreshes it.

| Agent | Scope | Status |
|---|---|---|
| @db | schema, client, queries, fixtures | **DONE + verified** — seed runs clean from scratch, 60 items |
| @backend | scoring engine, sim harness, API routes | dispatched |
| @frontend | duel session, list view, diff UI | dispatched |
| @qa | property tests, golden fixtures, API tests | dispatched |

## Integration points (where collisions would happen)

1. **`lib/db/queries.ts`** — @db writes it, @backend imports it. Signatures are
   fixed in `coord/CONTRACTS.md`. @backend: if it doesn't exist yet, code
   against the documented signatures anyway; it will land.
2. **HTTP API** — @backend writes it, @frontend consumes it. Shapes are fixed in
   `coord/CONTRACTS.md`. @frontend: build against those shapes with a local mock
   if the routes aren't up yet; do not wait.
3. **`lib/scoring/index.ts`** — @backend writes it, @qa tests it. Signatures are
   fixed in `lib/scoring/contract.ts`.

Nobody is blocked by anybody. All three integration points are specified ahead
of time precisely so you can work in parallel. If a contract is ambiguous,
write the question in your status file and implement your best reading.
