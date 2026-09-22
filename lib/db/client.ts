/**
 * Dual-driver DB connection — owned by @db.
 *
 * coord/CONTRACTS.md — Database:
 *   - DATABASE_URL set   -> @neondatabase/serverless + drizzle-orm/neon-http
 *   - DATABASE_URL unset -> @electric-sql/pglite persisted at .pglite/ +
 *                           drizzle-orm/pglite
 *
 * getDb() is the single entry point. It memoizes the connection (and the
 * schema-ensure step) so it is cheap to call from anywhere: a Next.js route
 * handler, a plain `tsx` script (seed.ts), or a vitest test. Nothing here
 * requires an env var to be set — the PGlite path is the zero-setup default
 * for local dev and tests.
 *
 * On the PGlite path (and harmlessly on the Neon path too — the statements
 * are idempotent) ensureSchema() runs `CREATE TABLE IF NOT EXISTS` for every
 * table in lib/db/schema.ts before the connection is handed out, so callers
 * never have to run a separate migration step.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import * as schema from './schema';

/**
 * Single dev voter for this MVP (docs/05 decision #2 — the column is kept
 * for free multiplayer forward-compatibility, but Phase 1 hardcodes one
 * voter rather than building auth).
 */
export const DEV_VOTER_ID = 'dev-voter';

export type AppDb = NeonHttpDatabase<typeof schema> | PgliteDatabase<typeof schema>;

let dbPromise: Promise<AppDb> | null = null;

/** Resolves once the connection is open AND the schema is confirmed to exist. */
export function getDb(): Promise<AppDb> {
  if (!dbPromise) {
    dbPromise = initDb().catch((err) => {
      // Don't cache a failed init — the next call should retry cleanly.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Test-only escape hatch: forces the next getDb() to open a fresh connection. */
export function __resetDbForTests(): void {
  dbPromise = null;
}

async function initDb(): Promise<AppDb> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const db: AppDb = drizzleNeon(neon(databaseUrl), { schema });
    await ensureSchema(db);
    return db;
  }

  // Under test, PGlite runs IN MEMORY rather than against ./.pglite.
  //
  // Vitest runs test files in parallel workers, and every worker was opening
  // a PGlite instance over the same on-disk data directory. PGlite is a
  // single-connection embedded Postgres, so the contention crashed its WASM
  // runtime with a bare `RuntimeError: Aborted()` — an intermittent failure
  // that moved between test files run to run (observed 30-36 of 36 passing
  // across repeated runs).
  //
  // In-memory gives each worker an isolated database, which removes the
  // contention entirely and is faster. Tests seed the data they need, so
  // nothing depends on state persisting across processes.
  const inMemory = process.env.VITEST !== undefined || process.env.PGLITE_IN_MEMORY === '1';
  const client = inMemory ? new PGlite() : new PGlite(path.join(process.cwd(), '.pglite'));

  const db: AppDb = drizzlePglite(client, { schema });
  await ensureSchema(db);
  return db;
}

/**
 * Idempotent `CREATE TABLE IF NOT EXISTS` for every table in schema.ts, run
 * as a single multi-statement batch. Keeps local dev and CI at zero setup
 * steps and matches lib/db/schema.ts exactly — update both together.
 */
async function ensureSchema(db: AppDb): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS lists (
      id text PRIMARY KEY,
      name text NOT NULL,
      capacity_items integer NOT NULL,
      decay_halflife_days integer NOT NULL,
      seed_order jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS items (
      id text PRIMARY KEY,
      list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      external_key text NOT NULL,
      title text NOT NULL,
      summary_line text NOT NULL,
      labels jsonb NOT NULL DEFAULT '[]',
      estimate double precision,
      state text NOT NULL,
      evidence jsonb NOT NULL DEFAULT '{}',
      created_at_external timestamptz NOT NULL,
      external_priority integer,
      external_sort_order double precision
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS list_items (
      list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      tier text,
      placed_at timestamptz,
      PRIMARY KEY (list_id, item_id)
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS comparisons (
      id text PRIMARY KEY,
      list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      voter_id text NOT NULL,
      item_a_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      item_b_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      outcome text NOT NULL,
      strategy text NOT NULL,
      is_audit boolean NOT NULL DEFAULT false,
      latency_ms integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS comparisons_list_id_created_at_idx ON comparisons (list_id, created_at);`,
  );
}
