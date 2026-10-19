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

## Connecting Linear (two steps)

**1. Create a personal API key.** In Linear: **Settings → Security & access →
Personal API keys**. Linear shows it only once, so copy it whole. Put it in
`.env.local`, which is gitignored:

```bash
echo 'LINEAR_API_KEY=lin_api_your_key_here' >> .env.local
```

**2. Check, then import.**

```bash
npm run linear:check                      # confirms the key, lists your teams
npm run linear:import -- --team ENG       # creates a list from that team
npm run dev                               # then open the printed /duel URL
```

`linear:check` prints every team with its open-issue count and how many have a
usable description, so you can pick a team worth ranking before importing.

### Options

| Flag | Default | What it does |
|---|---|---|
| `--team KEY` | *required* | Linear team key, e.g. `ENG` |
| `--capacity N` | 15 | Items above the cut line |
| `--limit N` | 150 | Max issues to pull |
| `--name "..."` | `KEY backlog (Linear)` | List name |
| `--allow-title-only` | off | Include issues with no description, using their title |

### Why a personal key and not OAuth

[04](04-integrations.md) originally specified OAuth2, written while
multiplayer was in scope. OAuth exists so *other people* can grant you access;
in a single-player tool there are no other people. A personal key is one env
var with no callback handling, and it is the right shape here rather than a
shortcut. OAuth becomes necessary only if this is hosted for multiple users.

### What gets imported

Only **open** issues (completed and canceled work is no longer a
prioritization decision). Mapping follows the table in
[04](04-integrations.md): `sortOrder` and `priority` seed the starting order,
so the seed-vs-settled diff has something real to compare against.

**Issues with no usable description are skipped**, and the count is reported.
A duel card needs a one-line problem statement to be judgeable in ~5 seconds
([01](01-product-spec.md)); an issue titled "Fix the thing (see thread)"
cannot be ranked. Use `--allow-title-only` to include them anyway.

### Restricted networks

The importer talks to `https://api.linear.app/graphql`. If you are running
somewhere with an egress allowlist, that host needs to be permitted or the
client will report that it could not be reached.

### Jira

Still unimplemented — see [04](04-integrations.md) and [06](06-roadmap.md).
