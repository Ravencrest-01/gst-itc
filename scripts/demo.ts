/**
 * End-to-end demo: seed → mock GSTR-2B sync → reconcile → vendor emails into Mailpit.
 *
 *   docker compose up -d mailpit     # inbox at http://localhost:8025
 *   pnpm demo                        # add --dry-run to preview without sending
 *
 * Uses the local embedded database (./.data/pglite) unless DATABASE_URL points at Neon.
 * Options: --as-of=YYYY-MM-DD (default today), --fy=2025-2026, --dry-run, --no-simulate
 * WhatsApp messages are mirrored into Mailpit (WHATSAPP_TRANSPORT=mailpit|memory|none).
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { dbKind, closeDb, getDb, migrateDb, schema } from '../src/db/client';
import { DEMO_ORG, seedDemoOrganization } from '../src/lib/demo/sample-data';
import { dispatchDunning } from '../src/lib/dunning/dispatcher';
import { createPurchaseBackedMockGsp, syncFinancialYear } from '../src/lib/gsp/provider';
import { formatInr } from '../src/lib/notifications/email/templates';
import { emailTransportFromEnv } from '../src/lib/notifications/email/transport';
import { whatsappTransportFromEnv } from '../src/lib/notifications/whatsapp/transport';
import { processWhatsAppWebhook, replyWebhook, statusWebhook } from '../src/lib/notifications/whatsapp/webhook';
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
  const whatsapp = whatsappTransportFromEnv(transport);
  // --as-of also drives the T+0/T+5/T+10 cadence, so escalation can be demonstrated.
  const now = arg('as-of') ? new Date(`${asOf}T${new Date().toISOString().slice(11)}`) : new Date();
  const report = await dispatchDunning(db, {
    organizationId: org.id,
    runId,
    transport,
    whatsapp,
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    from: process.env.EMAIL_FROM ?? `GST Compliance <compliance@${DEMO_ORG.tradeName.toLowerCase()}.example>`,
    replyTo: process.env.EMAIL_REPLY_TO,
    dryRun,
    now,
  });

  console.log(`\nDunning via ${transport.name}${whatsapp ? ` + ${whatsapp.name}` : ''}${dryRun ? ' (dry run)' : ''}`);
  const ch = (c: string) => (c === 'EMAIL' ? 'email   ' : 'whatsapp');
  for (const p of report.previews) console.log(`  preview  ${ch(p.channel)} ${p.vendorGstin}  stage ${p.stage}  ${p.subject}`);
  for (const s of report.sent) console.log(`  sent     ${ch(s.channel)} ${s.vendorGstin}  stage ${s.stage}  ${formatInr(s.totalAtRisk)} → ${s.to}`);
  for (const s of report.skipped) console.log(`  skipped  ${ch(s.channel)} ${s.vendorGstin}  ${s.reason}`);
  for (const f of report.failed) console.log(`  FAILED   ${ch(f.channel)} ${f.vendorGstin}  ${f.error}`);
  if (report.failed.some((f) => /ECONNREFUSED/.test(f.error))) {
    console.log('\nMailpit is not reachable. Start it with: docker compose up -d mailpit');
    process.exitCode = 1;
    return;
  }

  // Mock provider: post the delivery/read receipts and one vendor reply that Meta would
  // send, through the same webhook processing the /api/webhooks/whatsapp route uses.
  const waSent = report.sent.filter((s) => s.channel === 'WHATSAPP');
  if (waSent.length && !process.argv.includes('--no-simulate')) {
    const rows = await db
      .select({ id: schema.vendorCommunications.id, wamid: schema.vendorCommunications.externalMessageId, to: schema.vendorCommunications.recipientAddress })
      .from(schema.vendorCommunications)
      .where(inArray(schema.vendorCommunications.id, waSent.map((s) => s.communicationId)));
    const minutes = (m: number) => new Date(now.getTime() + m * 60_000);
    const receipts = rows.flatMap((r, i) => [
      { messageId: r.wamid!, status: 'delivered' as const, at: minutes(1), to: r.to },
      ...(i % 2 === 0 ? [{ messageId: r.wamid!, status: 'read' as const, at: minutes(30), to: r.to }] : []),
    ]);
    const statusResult = await processWhatsAppWebhook(db, statusWebhook(receipts));
    const replier = rows[0];
    const replyResult = await processWhatsAppWebhook(
      db,
      replyWebhook({ from: replier.to, text: 'We have filed the missing invoices in GSTR-1 today.', at: minutes(90), contextMessageId: replier.wamid! }),
    );
    console.log(
      `\nSimulated WhatsApp webhooks: ${statusResult.statusesApplied} receipts applied, ` +
        `${replyResult.repliesMatched} vendor reply (${replier.to}) — escalation stops for that vendor`,
    );
    const states = await db
      .select({ channel: schema.vendorCommunications.channel, status: schema.vendorCommunications.status })
      .from(schema.vendorCommunications)
      .where(eq(schema.vendorCommunications.reconciliationRunId, runId));
    const tally: Record<string, number> = {};
    for (const s of states) tally[`${s.channel} ${s.status}`] = (tally[`${s.channel} ${s.status}`] ?? 0) + 1;
    console.table(tally);
  }
  if (report.sent.length && transport.name.startsWith('smtp://localhost')) {
    console.log('\nOpen the inbox: http://localhost:8025 (WhatsApp messages appear as …@whatsapp.local)');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
