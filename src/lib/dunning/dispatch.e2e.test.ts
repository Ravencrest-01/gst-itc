import { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { DEMO_ORG, DEMO_VENDORS, seedDemoOrganization } from '../demo/sample-data';
import { createPurchaseBackedMockGsp, syncFinancialYear } from '../gsp/provider';
import { createMemoryTransport, type EmailTransport } from '../notifications/email/transport';
import { resolveStatementToken } from '../notifications/tokens';
import { runReconciliation } from '../reconciliation/service';
import { dispatchDunningEmails, loadVendorNotices } from './dispatcher';

const AS_OF = '2026-11-06';
const at = (days: number) => new Date(Date.parse(`${AS_OF}T09:00:00Z`) + days * 86_400_000);

let db: Db;
let orgId: string;
let runId: string;

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: 'drizzle' });
  db = pg as unknown as Db;

  const { org, ingestion } = await seedDemoOrganization(db);
  orgId = org.id;
  expect(ingestion.error).toBeUndefined();

  const gsp = createPurchaseBackedMockGsp(db, orgId, { seed: 3 });
  const synced = await syncFinancialYear(db, gsp, { organizationId: orgId, gstin: DEMO_ORG.primaryGstin, financialYear: '2025-2026', asOf: AS_OF });
  expect(synced).toHaveLength(12);
  expect(synced.every((s) => !s.error)).toBe(true);

  ({ runId } = await runReconciliation(db, { organizationId: orgId, financialYear: '2025-2026', asOf: AS_OF }));
}, 120_000);

const options = (transport: EmailTransport, days = 0) => ({
  organizationId: orgId,
  runId,
  transport,
  appBaseUrl: 'http://localhost:3000',
  from: 'GST Compliance <compliance@demomfg.example>',
  now: at(days),
});

describe('reconciliation run persistence', () => {
  it('stores every PR invoice in exactly one result and refreshes vendor scores', async () => {
    const [run] = await db.select().from(schema.reconciliationRuns).where(eq(schema.reconciliationRuns.id, runId));
    expect(run).toMatchObject({ status: 'COMPLETED', financialYear: '2025-2026' });
    expect(run.totalPrCount).toBe(DEMO_VENDORS.length * 24);
    expect(run.totalItcAtRisk).toBeGreaterThan(0);

    const results = await db.select().from(schema.matchResults).where(eq(schema.matchResults.reconciliationRunId, runId));
    const prIds = results.flatMap((r) => (r.prInvoiceId ? [r.prInvoiceId] : []));
    expect(new Set(prIds).size).toBe(run.totalPrCount);
    expect(results.some((r) => r.matchStatus === 'MISSING_IN_2B')).toBe(true);
    expect(results.some((r) => r.matchStatus === 'MISSING_IN_PR')).toBe(true);
    expect(results.every((r) => r.section164Deadline === '2026-11-30')).toBe(true);

    const vendors = await db.select().from(schema.vendors).where(eq(schema.vendors.organizationId, orgId));
    expect(vendors.some((v) => v.complianceScore < 100)).toBe(true);
    expect(vendors.some((v) => v.riskTier !== 'LOW')).toBe(true);
  });
});

describe('dunning dispatch', () => {
  it('emails every eligible vendor once, with a working statement link', async () => {
    const notices = await loadVendorNotices(db, { organizationId: orgId, runId });
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.every((n) => n.totalAtRisk >= 5_000)).toBe(true);

    const transport = createMemoryTransport();
    const report = await dispatchDunningEmails(db, options(transport));
    const withEmail = notices.filter((n) => n.vendor.contactEmail);
    expect(report.failed).toEqual([]);
    expect(report.sent).toHaveLength(withEmail.length);
    expect(report.sent.every((s) => s.stage === 0)).toBe(true);
    if (notices.length > withEmail.length) {
      expect(report.skipped).toContainEqual(expect.objectContaining({ reason: 'no contact email' }));
    }

    const mail = transport.sent[0];
    expect(mail.subject).toMatch(/^\[Action required\]/);
    expect(mail.attachments?.[0].filename).toMatch(/^ITC-discrepancies-.+-2025-2026\.csv$/);
    const token = /\/vendor\/statement\/([A-Za-z0-9_-]{43})/.exec(mail.text)![1];
    const resolved = await resolveStatementToken(db, token, at(0));
    expect(resolved).toMatchObject({ reconciliationRunId: runId, accessCount: 1 });
    expect(await resolveStatementToken(db, token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), at(0))).toBeNull();

    const comms = await db.select().from(schema.vendorCommunications).where(eq(schema.vendorCommunications.reconciliationRunId, runId));
    expect(comms).toHaveLength(withEmail.length);
    expect(comms.every((c) => c.status === 'SENT' && c.externalMessageId && c.sentAt)).toBe(true);
  });

  it('does not resend before the next stage is due', async () => {
    const transport = createMemoryTransport();
    const report = await dispatchDunningEmails(db, options(transport, 2));
    expect(transport.sent).toHaveLength(0);
    expect(report.skipped.every((s) => ['next stage not due yet', 'no contact email'].includes(s.reason))).toBe(true);
  });

  it('escalates at T+5 and sends the final notice at T+10 with finance in CC', async () => {
    const t5 = createMemoryTransport();
    const r5 = await dispatchDunningEmails(db, options(t5, 5));
    expect(r5.failed).toEqual([]);
    expect(r5.sent.length).toBeGreaterThan(0);
    expect(r5.sent.every((s) => s.stage === 1)).toBe(true);
    expect(t5.sent[0].subject).toMatch(/^\[Reminder 2\]/);

    const t10 = createMemoryTransport();
    const r10 = await dispatchDunningEmails(db, options(t10, 10));
    expect(r10.sent.every((s) => s.stage === 2)).toBe(true);
    expect(t10.sent[0].subject).toMatch(/^\[Final notice\]/);
    expect(t10.sent[0].cc?.sort()).toEqual(['cfo@demomfg.example', 'finance@demomfg.example']);

    const r20 = await dispatchDunningEmails(db, options(createMemoryTransport(), 20));
    expect(r20.sent).toEqual([]);
    expect(r20.skipped).toContainEqual(expect.objectContaining({ reason: 'escalation complete' }));
  });

  it('does not restart the sequence when reconciliation is re-run', async () => {
    const { runId: rerun } = await runReconciliation(db, { organizationId: orgId, financialYear: '2025-2026', asOf: AS_OF });
    const report = await dispatchDunningEmails(db, { ...options(createMemoryTransport(), 12), runId: rerun });
    expect(report.sent).toEqual([]);
    expect(report.skipped).toContainEqual(expect.objectContaining({ reason: 'escalation complete' }));
  });

  it('records failures and retries them on the next dispatch', async () => {
    // After the 30-day window a new cycle starts with stage 0.
    const { runId: run2 } = await runReconciliation(db, { organizationId: orgId, financialYear: '2025-2026', asOf: AS_OF });
    const failing: EmailTransport = { name: 'down', send: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:1025'); } };
    const failed = await dispatchDunningEmails(db, { ...options(failing, 45), runId: run2 });
    expect(failed.sent).toEqual([]);
    expect(failed.failed.length).toBeGreaterThan(0);
    const [row] = await db
      .select()
      .from(schema.vendorCommunications)
      .where(and(eq(schema.vendorCommunications.reconciliationRunId, run2), eq(schema.vendorCommunications.status, 'FAILED')));
    expect(row.failureReason).toMatch(/ECONNREFUSED/);

    const retry = await dispatchDunningEmails(db, { ...options(createMemoryTransport(), 45), runId: run2 });
    expect(retry.sent.every((r) => r.stage === 0)).toBe(true);
    expect(retry.sent.length).toBe(failed.failed.length);
    const rows = await db.select().from(schema.vendorCommunications).where(eq(schema.vendorCommunications.reconciliationRunId, run2));
    expect(rows).toHaveLength(failed.failed.length); // retried in place, not duplicated
  });

  it('supports a dry run that writes nothing', async () => {
    const { runId: run3 } = await runReconciliation(db, { organizationId: orgId, financialYear: '2025-2026', asOf: AS_OF });
    const transport = createMemoryTransport();
    const report = await dispatchDunningEmails(db, { ...options(transport, 90), runId: run3, dryRun: true });
    expect(report.previews.length).toBeGreaterThan(0);
    expect(transport.sent).toHaveLength(0);
    const rows = await db.select().from(schema.vendorCommunications).where(eq(schema.vendorCommunications.reconciliationRunId, run3));
    expect(rows).toHaveLength(0);
  });
});
