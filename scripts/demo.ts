/**
 * End-to-end demo: seed → mock GSTR-2B sync → reconcile → vendor emails into Mailpit.
 *
 *   docker compose up -d mailpit     # inbox at http://localhost:8025
 *   pnpm demo                        # add --dry-run to preview without sending
 *
 * Uses the local embedded database (./.data/pglite) unless DATABASE_URL points at Neon.
 * Options: --as-of=YYYY-MM-DD (default today), --fy=2025-2026, --dry-run
 */
import 'dotenv/config';
import { dbKind, closeDb, getDb, migrateDb } from '../src/db/client';
import { DEMO_ORG, seedDemoOrganization } from '../src/lib/demo/sample-data';
import { dispatchDunningEmails } from '../src/lib/dunning/dispatcher';
import { createPurchaseBackedMockGsp, syncFinancialYear } from '../src/lib/gsp/provider';
import { formatInr } from '../src/lib/notifications/email/templates';
import { emailTransportFromEnv } from '../src/lib/notifications/email/transport';
import { runReconciliation } from '../src/lib/reconciliation/service';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const dryRun = process.argv.includes('--dry-run');
const asOf = arg('as-of') ?? new Date().toISOString().slice(0, 10);
const financialYear = arg('fy') ?? '2025-2026';

async function main() {
  const db = await getDb();
  await migrateDb(db);
  console.log(`Database: ${dbKind()}`);

  const { org, ingestion } = await seedDemoOrganization(db, financialYear);
  console.log(`Purchase register: ${ingestion.summary?.writtenCount ?? 0} invoices for ${org.legalName}`);

  const gsp = createPurchaseBackedMockGsp(db, org.id, { seed: 3 });
  const synced = await syncFinancialYear(db, gsp, { organizationId: org.id, gstin: DEMO_ORG.primaryGstin, financialYear, asOf });
  console.log(`GSTR-2B (mock GSP): ${synced.reduce((n, s) => n + s.written, 0)} documents over ${synced.length} periods`);
  for (const s of synced.filter((s) => s.error)) console.warn(`  ${s.returnPeriod}: ${s.error}`);

  const { runId, summary, vendors } = await runReconciliation(db, { organizationId: org.id, financialYear, asOf });
  console.log(`\nReconciliation ${runId} (as of ${asOf})`);
  console.table(summary.byStatus);
  console.log(
    `ITC at risk ${formatInr(summary.totalItcAtRisk)} · Section 16(4) exposure ${formatInr(summary.section164RiskAmount)} · ` +
      `unbooked ITC ${formatInr(summary.totalItcOpportunity)} · lapsed ${formatInr(summary.lapsedItc)}`,
  );
  console.table(
    vendors.slice(0, 8).map((v) => ({ gstin: v.gstin, atRisk: formatInr(v.itcAtRisk), tier: v.riskTier, score: v.complianceScore, dunning: v.dunningEligible })),
  );

  const transport = emailTransportFromEnv();
  const report = await dispatchDunningEmails(db, {
    organizationId: org.id,
    runId,
    transport,
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    from: process.env.EMAIL_FROM ?? `GST Compliance <compliance@${DEMO_ORG.tradeName.toLowerCase()}.example>`,
    replyTo: process.env.EMAIL_REPLY_TO,
    dryRun,
    // --as-of also drives the T+0/T+5/T+10 cadence, so escalation can be demonstrated.
    now: arg('as-of') ? new Date(`${asOf}T${new Date().toISOString().slice(11)}`) : undefined,
  });

  console.log(`\nDunning via ${transport.name}${dryRun ? ' (dry run)' : ''}`);
  for (const p of report.previews) console.log(`  preview  ${p.vendorGstin}  stage ${p.stage}  ${p.subject}`);
  for (const s of report.sent) console.log(`  sent     ${s.vendorGstin}  stage ${s.stage}  ${formatInr(s.totalAtRisk)} → ${s.to}`);
  for (const s of report.skipped) console.log(`  skipped  ${s.vendorGstin}  ${s.reason}`);
  for (const f of report.failed) console.log(`  FAILED   ${f.vendorGstin}  ${f.error}`);
  if (report.failed.some((f) => /ECONNREFUSED/.test(f.error))) {
    console.log('\nMailpit is not reachable. Start it with: docker compose up -d mailpit');
    process.exitCode = 1;
  } else if (report.sent.length && transport.name.startsWith('smtp://localhost')) {
    console.log('\nOpen the inbox: http://localhost:8025');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
