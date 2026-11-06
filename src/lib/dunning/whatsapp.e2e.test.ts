import { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { DEMO_ORG, seedDemoOrganization } from '../demo/sample-data';
import { createPurchaseBackedMockGsp, syncFinancialYear } from '../gsp/provider';
import { createMemoryTransport } from '../notifications/email/transport';
import { createMemoryWhatsAppTransport } from '../notifications/whatsapp/transport';
import { processWhatsAppWebhook, replyWebhook, statusWebhook } from '../notifications/whatsapp/webhook';
import { runReconciliation } from '../reconciliation/service';
import { dispatchDunning, loadVendorNotices } from './dispatcher';

const AS_OF = '2026-11-06';
const at = (days: number, hour = 9) => new Date(Date.parse(`${AS_OF}T00:00:00Z`) + days * 86_400_000 + hour * 3_600_000);

let db: Db;
let orgId: string;
let runId: string;

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: 'drizzle' });
  db = pg as unknown as Db;
  const { org } = await seedDemoOrganization(db);
  orgId = org.id;
  await syncFinancialYear(db, createPurchaseBackedMockGsp(db, orgId, { seed: 3 }), {
    organizationId: orgId,
    gstin: DEMO_ORG.primaryGstin,
    financialYear: '2025-2026',
    asOf: AS_OF,
  });
  ({ runId } = await runReconciliation(db, { organizationId: orgId, financialYear: '2025-2026', asOf: AS_OF }));
}, 120_000);

const comms = schema.vendorCommunications;
const waRows = () => db.select().from(comms).where(and(eq(comms.reconciliationRunId, runId), eq(comms.channel, 'WHATSAPP')));

describe('WhatsApp dunning end to end', () => {
  const email = createMemoryTransport();
  const wa = createMemoryWhatsAppTransport();

  it('sends email and WhatsApp to each eligible vendor', async () => {
    const notices = await loadVendorNotices(db, { organizationId: orgId, runId });
    const report = await dispatchDunning(db, {
      organizationId: orgId,
      runId,
      appBaseUrl: 'http://localhost:3000',
      transport: email,
      from: 'compliance@demomfg.example',
      whatsapp: wa,
      now: at(0),
    });
    expect(report.failed).toEqual([]);
    const sentWa = report.sent.filter((s) => s.channel === 'WHATSAPP');
    expect(sentWa.length).toBeGreaterThan(0);
    expect(sentWa.every((s) => /^\+91[6-9]\d{9}$/.test(s.to))).toBe(true);
    expect(report.sent.filter((s) => s.channel === 'EMAIL').length).toBe(notices.filter((n) => n.vendor.contactEmail).length);

    // Nashik has a landline; Hyderabad has no phone.
    const skippedWa = report.skipped.filter((s) => s.channel === 'WHATSAPP').map((s) => s.reason);
    for (const reason of skippedWa) expect(reason).toMatch(/^(invalid WhatsApp number|no WhatsApp number)/);

    // Email and WhatsApp share one statement link per vendor.
    const first = wa.sent[0];
    const token = first.request.template.components[2].parameters[0].text;
    const mail = email.sent.find((m) => m.text.includes(token));
    expect(mail).toBeDefined();

    // The stored audit copy never contains the raw token.
    const rows = await waRows();
    expect(rows.every((r) => r.status === 'SENT' && r.externalMessageId?.startsWith('wamid.'))).toBe(true);
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toContain(token);
    expect(JSON.stringify(rows[0].payload)).toContain('<token>');
  });

  it('applies delivery receipts in order and never moves backwards', async () => {
    const [a, b, c] = wa.sent;
    const result = await processWhatsAppWebhook(
      db,
      statusWebhook([
        { messageId: a.messageId, status: 'read', at: at(0, 11) },
        { messageId: a.messageId, status: 'delivered', at: at(0, 10) },
        { messageId: b.messageId, status: 'delivered', at: at(0, 10) },
        { messageId: c.messageId, status: 'failed', at: at(0, 10), error: 'Message undeliverable' },
        { messageId: 'wamid.unknown', status: 'delivered', at: at(0, 10) },
      ]),
    );
    expect(result).toMatchObject({ statusesApplied: 4, statusesIgnored: 1 });

    // A late "delivered" after "read", and a "failed" after delivery, are ignored.
    const late = await processWhatsAppWebhook(
      db,
      statusWebhook([
        { messageId: a.messageId, status: 'delivered', at: at(0, 12) },
        { messageId: b.messageId, status: 'failed', at: at(0, 12), error: 'late' },
      ]),
    );
    expect(late).toMatchObject({ statusesApplied: 0, statusesIgnored: 2 });

    const byWamid = new Map((await waRows()).map((r) => [r.externalMessageId, r]));
    expect(byWamid.get(a.messageId)).toMatchObject({ status: 'READ', deliveredAt: at(0, 10), readAt: at(0, 11) });
    expect(byWamid.get(b.messageId)).toMatchObject({ status: 'DELIVERED' });
    expect(byWamid.get(c.messageId)).toMatchObject({ status: 'FAILED', failureReason: '131026 Message undeliverable' });
  });

  it('records a vendor reply and stops escalation on every channel', async () => {
    const replier = wa.sent[1];
    const result = await processWhatsAppWebhook(
      db,
      replyWebhook({ from: replier.to, text: 'Filed in GSTR-1 today, ARN AA270925123456X', at: at(1), contextMessageId: replier.messageId }),
    );
    expect(result).toMatchObject({ repliesMatched: 1, repliesUnmatched: 0 });
    const [row] = await db.select().from(comms).where(eq(comms.externalMessageId, replier.messageId));
    expect(row).toMatchObject({ status: 'RESPONDED', respondedAt: at(1) });
    expect(row.payload).toMatchObject({ reply: { text: 'Filed in GSTR-1 today, ARN AA270925123456X' } });

    // Unquoted reply from a known number is attributed to the latest message to it.
    const other = wa.sent[3];
    const free = await processWhatsAppWebhook(db, replyWebhook({ from: other.to, text: 'will do', at: at(1) }));
    expect(free.repliesMatched).toBe(1);
    expect(await processWhatsAppWebhook(db, replyWebhook({ from: '+919999999999', text: '?', at: at(1) }))).toMatchObject({ repliesUnmatched: 1 });

    const t5 = await dispatchDunning(db, {
      organizationId: orgId,
      runId,
      appBaseUrl: 'http://localhost:3000',
      transport: createMemoryTransport(),
      from: 'compliance@demomfg.example',
      whatsapp: createMemoryWhatsAppTransport(),
      now: at(5),
    });
    const replierGstin = (await db.select().from(comms).where(eq(comms.id, row.id)))[0].vendorId;
    const [vendor] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, replierGstin));
    const forReplier = [...t5.sent, ...t5.skipped].filter((r) => r.vendorGstin === vendor.gstin);
    expect(forReplier.map((r) => ('reason' in r ? r.reason : 'sent'))).toEqual(['vendor responded', 'vendor responded']);

    // Everyone else escalates to stage 1 on both channels, except the failed WhatsApp, which is retried at stage 0.
    expect(t5.sent.some((s) => s.channel === 'WHATSAPP' && s.stage === 1)).toBe(true);
    expect(t5.sent.some((s) => s.channel === 'EMAIL' && s.stage === 1)).toBe(true);
  });
});
