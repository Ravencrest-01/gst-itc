/** Applies drizzle/ migrations. Uses ./.data/pglite unless DATABASE_URL points at Neon. */
import 'dotenv/config';
import { dbKind, closeDb, getDb, migrateDb } from '../src/db/client';

async function main() {
  const db = await getDb();
  await migrateDb(db);
  console.log(`Migrations applied (${dbKind()}${dbKind() === 'pglite' ? `: ${process.env.DATABASE_URL ?? 'pglite:./.data/pglite'}` : ''})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
