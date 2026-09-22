# 10 — Running and Deploying

## Run it locally (3 commands, no credentials)

```bash
npm install
npm run db:seed     # creates a 60-item demo backlog
npm run dev         # http://localhost:3000
```

That's the whole setup. There is no database to install, no Docker, no
`DATABASE_URL`, no migration step.

**Why it needs nothing:** with `DATABASE_URL` unset, `lib/db/client.ts` runs
[PGlite](https://pglite.dev) — real Postgres compiled to WASM — persisting to
`./.pglite/`. The schema is created on first connection via idempotent
`CREATE TABLE IF NOT EXISTS`, so there is never a migration to run.

`npm run db:seed` prints a list id and is idempotent — re-run it any time to
reset the demo to a clean state.

### What to do in the app

1. **`/`** — lists your backlogs; create one from the fixture data.
2. **`/lists/<id>/duel`** — the onboarding session. **Use the keyboard:**
   `←` / `→` to pick, `space` for "too close to call", `s` to skip. Mouse
   works, but the session is built for hands on the keys.
3. **`/lists/<id>`** — the ranked list with the cut line.
4. **`/lists/<id>/diff`** — seed-vs-settled: where the stored order and your
   judgement disagree. This is the payoff; it needs a few dozen duels first.
5. **`/lists/<id>/unplaced`** — triage queue for items added after creation.

### Other commands

```bash
npm test          # 36 tests (PGlite runs in-memory here, isolated per worker)
npm run typecheck # tsc --noEmit
npm run build     # production build
npm run sim       # simulation harness — takes ~25 minutes, see docs/09
```

---

## Deploy to Vercel

> **Not verified end to end.** The local path above is tested; the Vercel path
> below is derived from how the app is built, not from an actual deploy. Treat
> the first deploy as a shakedown.

### The one thing that matters: PGlite will not work on Vercel

PGlite persists to the local filesystem. Vercel's serverless filesystem is
**ephemeral and per-invocation**, so every request would get its own empty
database. You must set `DATABASE_URL`.

### Steps

1. **Create a Postgres database.** Vercel Postgres (Storage tab) or
   [Neon](https://neon.tech) — the client uses `@neondatabase/serverless`,
   so Neon is the smoothest fit. Any Postgres reachable over HTTP works.

2. **Set `DATABASE_URL`** in Vercel → Settings → Environment Variables, for
   Production, Preview and Development.

3. **Deploy.** Push the branch and import the repo, or:
   ```bash
   npx vercel --prod
   ```
   Next.js is auto-detected. No `vercel.json` is needed, and the API routes
   under `app/api/**` deploy as Vercel functions automatically — there is no
   separate backend server to host.

4. **Seed the deployed database** from your machine:
   ```bash
   DATABASE_URL="<your connection string>" npm run db:seed
   ```
   The schema is created automatically on first connection, so this is the
   only setup step. Or skip it and create a list from the UI.

### Things worth knowing before you deploy

- **Scoring runs inside the request.** Every vote refits Bradley-Terry and
  runs a 200-sample bootstrap — roughly 100-300ms for a 60-item list. Fine
  for Vercel's default timeout, but if you load a much larger backlog and
  votes get slow, lower `bootstrapB` in `lib/types.ts` before reaching for a
  queue. There is deliberately no worker to scale (docs/05).
- **`@electric-sql/pglite` is still imported even on the Neon path.** It is
  listed in `serverExternalPackages` so Next leaves it unbundled. Harmless,
  but it is dead weight in the deployment — worth making a dynamic import if
  bundle size ever matters.
- **No authentication.** Single hardcoded dev voter. Anyone with the URL can
  read and vote. Do not put a real backlog behind a public deployment until
  auth exists (out of scope for the MVP — see docs/06).
- **Neon's HTTP driver has no transactions.** `db.transaction()` throws at
  runtime. The query layer avoids it; keep it that way.

---

## Connecting a real backlog

Not built yet. The MVP runs on fixture data (`lib/db/fixtures.ts`) and the
Linear/Jira integration is specified but unimplemented — see
[04 — Integrations](04-integrations.md) for the API shapes and the spike
checklist, and [06 — Roadmap](06-roadmap.md) for where it sits.

To try it on your own data sooner, the cheapest path is to replace the
fixtures with an export of your real backlog: match the `Item` shape in
`lib/types.ts`, keep `externalSortOrder` reflecting your tracker's current
order so the seed-vs-settled diff has something real to say, and re-run
`npm run db:seed`.
