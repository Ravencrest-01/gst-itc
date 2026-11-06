/**
 * Seeds the demo organization, users, vendor contacts and a year of purchases.
 * Idempotent. Usage: pnpm db:seed [--fy=2025-2026]
 * For GSTR-2B data, reconciliation and emails, run `pnpm demo` instead.
 */
import 'dotenv/config';
import { closeDb, getDb, migrateDb } from '../src/db/client';
import { seedDemoOrganization } from '../src/lib/demo/sample-data';

const fy = process.argv.find((a) => a.startsWith('--fy='))?.split('=')[1] ?? '2025-2026';

async function main() {
  const db = await getDb();
  await migrateDb(db);
  const { org, ingestion } = await seedDemoOrganization(db, fy);
  console.log(`Seeded ${org.legalName} (${org.id}): ${ingestion.summary?.writtenCount ?? 0} purchase invoices for FY ${fy}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
