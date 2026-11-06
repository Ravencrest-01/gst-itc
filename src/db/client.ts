import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let cached: ReturnType<typeof createDb> | undefined;

function createDb(url: string) {
  return drizzle(neon(url), { schema, casing: 'snake_case' });
}

/** Lazily-created Drizzle client so importing this module never needs DATABASE_URL. */
export function getDb() {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');
    cached = createDb(url);
  }
  return cached;
}

export { schema };
