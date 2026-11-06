import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/** Works with the Neon HTTP driver (deployed) and PGlite (local dev, tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbKind = 'neon' | 'pglite';

/** Default local database: an embedded Postgres stored in ./.data/pglite. */
export const DEFAULT_LOCAL_DB = 'pglite:./.data/pglite';

export function dbKind(url = process.env.DATABASE_URL): DbKind {
  return !url || url.startsWith('pglite:') ? 'pglite' : 'neon';
}

let cached: Promise<Db> | undefined;

async function createDb(url: string | undefined): Promise<Db> {
  if (dbKind(url) === 'pglite') {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const location = (url ?? DEFAULT_LOCAL_DB).slice('pglite:'.length);
    // "pglite:memory" gives a throwaway in-memory database.
    if (location !== 'memory') {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(location, { recursive: true });
    }
    const client = location === 'memory' ? new PGlite() : new PGlite(location);
    closeClient = () => client.close();
    return drizzle(client, { schema }) as unknown as Db;
  }
  const { neon } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-http');
  return drizzle(neon(url!), { schema }) as unknown as Db;
}

/**
 * Lazily-created Drizzle client. DATABASE_URL selects the driver:
 *   unset or "pglite:<dir>" -> embedded Postgres on disk (no server needed)
 *   "postgresql://..."      -> Neon serverless over HTTP
 */
export function getDb(): Promise<Db> {
  cached ??= createDb(process.env.DATABASE_URL);
  return cached;
}

let closeClient: (() => Promise<void>) | undefined;

/**
 * Shuts the embedded database down cleanly. Scripts must call this before exiting:
 * a PGlite directory left open by a killed process can hang the next open.
 */
export async function closeDb(): Promise<void> {
  if (!cached) return;
  await cached;
  await closeClient?.();
  closeClient = undefined;
  cached = undefined;
}

/** Applies drizzle/ migrations with the driver matching DATABASE_URL. */
export async function migrateDb(db: Db, migrationsFolder = 'drizzle'): Promise<void> {
  if (dbKind() === 'pglite') {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/neon-http/migrator');
    await migrate(db as never, { migrationsFolder });
  }
}

export { schema };
