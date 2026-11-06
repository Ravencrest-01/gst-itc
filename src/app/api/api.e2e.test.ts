import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb, migrateDb, schema, type Db } from '@/db/client';
import { DEMO_ORG, DEMO_USERS, DEMO_VENDORS, samplePurchaseRegisterCsv } from '@/lib/demo/sample-data';
import { createStatementToken } from '@/lib/notifications/tokens';

import * as ingestion from './ingestion/route';
import * as sync from './gstr2b/sync/route';
import * as runRoute from './reconciliation/run/route';
import * as runsRoute from './reconciliation/runs/route';
import * as runById from './reconciliation/[id]/route';
import * as results from './reconciliation/[id]/results/route';
import * as exportRoute from './reconciliation/[id]/export/route';
import * as override from './reconciliation/results/[resultId]/route';
import * as ledger from './vendors/ledger/route';
import * as comms from './communications/route';
import * as dispatch from './communications/dispatch/route';
import * as statement from './vendor/statement/[token]/route';

process.env.DATABASE_URL = 'pglite:memory';
process.env.EMAIL_TRANSPORT = 'memory';
process.env.WHATSAPP_TRANSPORT = 'memory';
process.env.APP_BASE_URL = 'http://localhost:3000';

const AS_OF = '2026-11-06';
const BASE = 'http://localhost:3000';

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(fn: unknown, path: string, init: { method?: string; body?: unknown; params?: Record<string, string> } = {}) {
  const body = init.body instanceof FormData ? init.body : init.body !== undefined ? JSON.stringify(init.body) : undefined;
  const res = await (fn as Handler)(new Request(`${BASE}${path}`, { method: init.method ?? 'GET', body }), {
    params: Promise.resolve(init.params ?? {}),
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : null;
  return { res, status: res.status, data };
}

let db: Db;
let runId: string;

beforeAll(async () => {
  db = await getDb();
  await migrateDb(db);
}, 60_000);

describe('request context', () => {
  it('needs an organization', async () => {
    const { status, data } = await call(runsRoute.GET, '/api/reconciliation/runs');
    expect(status).toBe(400);
    expect(data.error).toBe('No organization exists yet');
  });
});

describe('ingestion → sync → run', () => {
  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values(DEMO_ORG).returning();
    await db.insert(schema.users).values(DEMO_USERS.map((u) => ({ ...u, organizationId: org.id })));
  });

  it('validates uploads', async () => {
    const noFile = new FormData();
    noFile.set('source', 'PURCHASE_REGISTER');
    expect((await call(ingestion.POST, '/api/ingestion', { method: 'POST', body: noFile })).status).toBe(400);

    const badSource = new FormData();
    badSource.set('file', new File(['x'], 'pr.csv'));
    badSource.set('source', 'LEDGER');
    const bad = await call(ingestion.POST, '/api/ingestion', { method: 'POST', body: badSource });
    expect(bad.status).toBe(400);
    expect(bad.data.details[0].path).toBe('');

    const empty = new FormData();
    empty.set('file', new File(['a,b\n1,2'], 'x.csv'));
    empty.set('source', 'PURCHASE_REGISTER');
    const unusable = await call(ingestion.POST, '/api/ingestion', { method: 'POST', body: empty });
    expect(unusable.status).toBe(422);
    expect(unusable.data.error).toMatch(/No invoice rows/);
  });

  it('uploads a purchase register', async () => {
    const form = new FormData();
    form.set('file', new File([samplePurchaseRegisterCsv()], 'purchase-register.csv', { type: 'text/csv' }));
    form.set('source', 'PURCHASE_REGISTER');
    form.set('mapping', JSON.stringify({ invoiceNumber: 'Supplier Invoice No.' }));
    const { status, data } = await call(ingestion.POST, '/api/ingestion', { method: 'POST', body: form });
    expect(status).toBe(201);
    expect(data.summary).toMatchObject({ writtenCount: DEMO_VENDORS.length * 24, errorCount: 0 });
    expect(data.summary.mappings[''].invoiceNumber).toBe('Supplier Invoice No.');

    for (const v of DEMO_VENDORS) {
      await db.update(schema.vendors).set({ contactEmail: v.contactEmail, contactPhone: v.contactPhone, contactName: v.contactName }).where(eq(schema.vendors.gstin, v.gstin));
    }
  });

  it('syncs GSTR-2B from the mock GSP', async () => {
    expect((await call(sync.POST, '/api/gstr2b/sync', { method: 'POST', body: { financialYear: '2025-2026', returnPeriod: '08-2025' } })).status).toBe(400);
    const { status, data } = await call(sync.POST, '/api/gstr2b/sync', { method: 'POST', body: { financialYear: '2025-2026', asOf: AS_OF } });
    expect(status).toBe(200);
    expect(data).toMatchObject({ provider: 'mock', failed: 0 });
    expect(data.periods).toHaveLength(12);
    expect(data.written).toBeGreaterThan(200);
  });

  it('runs reconciliation', async () => {
    expect((await call(runRoute.POST, '/api/reconciliation/run', { method: 'POST', body: { financialYear: '2025-2027' } })).status).toBe(400);
    const { status, data } = await call(runRoute.POST, '/api/reconciliation/run', {
      method: 'POST',
      body: { financialYear: '2025-2026', asOf: AS_OF },
    });
    expect(status).toBe(201);
    runId = data.runId;
    expect(data.summary.totalPr).toBe(DEMO_VENDORS.length * 24);
    expect(data.dunningEligibleVendors).toBeGreaterThan(0);
  });

  it('lists and reads runs', async () => {
    const list = await call(runsRoute.GET, '/api/reconciliation/runs?financialYear=2025-2026');
    expect(list.data.runs.map((r: { id: string }) => r.id)).toContain(runId);
    const one = await call(runById.GET, `/api/reconciliation/${runId}`, { params: { id: runId } });
    expect(one.data.run.status).toBe('COMPLETED');
    expect(one.data.run.breakdown.find((b: { status: string }) => b.status === 'EXACT_MATCH').count).toBeGreaterThan(0);
    expect((await call(runById.GET, '/x', { params: { id: crypto.randomUUID() } })).status).toBe(404);
    expect((await call(runById.GET, '/x', { params: { id: 'nope' } })).status).toBe(400);
  });
});

describe('results', () => {
  const get = (qs = '') => call(results.GET, `/api/reconciliation/${runId}/results${qs}`, { params: { id: runId } });

  it('pages, sorts and totals', async () => {
    const { data } = await get('?pageSize=25');
    expect(data.rows).toHaveLength(25);
    expect(data.total).toBeGreaterThan(280);
    const atRisk = data.rows.map((r: { itcAtRisk: number }) => r.itcAtRisk);
    expect(atRisk).toEqual([...atRisk].sort((a, b) => b - a));
    expect(data.rows[0]).toMatchObject({ prInvoiceNumber: expect.any(String), vendorName: expect.any(String) });

    const page2 = await get('?pageSize=25&page=2');
    const ids = new Set(data.rows.map((r: { id: string }) => r.id));
    expect(page2.data.rows.some((r: { id: string }) => ids.has(r.id))).toBe(false);
  });

  it('filters by status, risk and search', async () => {
    const missing = await get('?status=MISSING_IN_2B,VALUE_MISMATCH&risk164=true');
    expect(missing.data.total).toBeGreaterThan(0);
    for (const r of missing.data.rows) {
      expect(['MISSING_IN_2B', 'VALUE_MISMATCH']).toContain(r.status);
      expect(r.isSection164Risk).toBe(true);
    }
    const search = await get('?q=acme');
    expect(search.data.rows.every((r: { vendorName: string }) => /acme/i.test(r.vendorName))).toBe(true);
    expect((await get('?status=NOPE')).status).toBe(400);
    expect((await get('?pageSize=1000')).status).toBe(400);
  });

  it('applies and removes manual overrides with an audit trail', async () => {
    const before = await get('?status=MISSING_IN_2B&pageSize=1');
    const row = before.data.rows[0];
    const patch = (body: unknown) => call(override.PATCH, '/x', { method: 'PATCH', body, params: { resultId: row.id } });

    expect((await patch({ status: 'EXACT_MATCH', note: 'x' })).status).toBe(400);
    const done = await patch({ status: 'EXACT_MATCH', note: 'Vendor filed late; visible in 2B for Dec 2025' });
    expect(done.status).toBe(200);
    expect(done.data.result).toMatchObject({ status: 'EXACT_MATCH', matchStatus: 'MISSING_IN_2B', itcAtRisk: 0, originalItcAtRisk: row.itcAtRisk });
    expect(done.data.result.notes).toMatch(/MISSING_IN_2B → EXACT_MATCH: Vendor filed late/);
    expect((await patch({ status: 'EXACT_MATCH', note: 'again please' })).status).toBe(409);

    const after = await get('?status=MISSING_IN_2B&pageSize=1');
    expect(after.data.total).toBe(before.data.total - 1);
    expect(after.data.totals.itcAtRisk).toBeCloseTo(before.data.totals.itcAtRisk - row.itcAtRisk, 2);
    expect((await get('?overridden=true')).data.total).toBe(1);

    const undo = await patch({ status: null, note: 'Override was a mistake' });
    expect(undo.data.result).toMatchObject({ status: 'MISSING_IN_2B', overrideStatus: null, itcAtRisk: row.itcAtRisk });
    expect((await call(override.PATCH, '/x', { method: 'PATCH', body: { status: null, note: 'none' }, params: { resultId: crypto.randomUUID() } })).status).toBe(404);
  });
});

describe('export', () => {
  it('streams CSV with the same filters', async () => {
    const { data: page } = await call(results.GET, `/api/reconciliation/${runId}/results?status=MISSING_IN_2B`, { params: { id: runId } });
    const { res } = await call(exportRoute.GET, `/api/reconciliation/${runId}/export?status=MISSING_IN_2B`, { params: { id: runId } });
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="itc-reconciliation-2025-2026-.+\.csv"/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM so Excel shows ₹ and names correctly
    const lines = new TextDecoder().decode(bytes).trimEnd().split('\r\n');
    expect(lines[0].startsWith('Vendor,Supplier GSTIN,Status')).toBe(true);
    expect(lines).toHaveLength(page.total + 1);
    expect(lines.slice(1).filter((l) => !l.includes(',MISSING_IN_2B,'))).toEqual([]);
  });

  it('streams a valid Excel workbook', async () => {
    const { res } = await call(exportRoute.GET, `/api/reconciliation/${runId}/export?format=xlsx`, { params: { id: runId } });
    expect(res.headers.get('content-type')).toMatch(/spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const ws = wb.getWorksheet('Reconciliation')!;
    const { data } = await call(results.GET, `/api/reconciliation/${runId}/results?pageSize=1`, { params: { id: runId } });
    expect(ws.rowCount).toBe(data.total + 1);
    expect(ws.getRow(1).getCell(16).value).toBe('ITC at risk');
    expect(typeof ws.getRow(2).getCell(16).value).toBe('number');
  });
});

describe('vendors, dispatch, communications, statement', () => {
  it('ranks vendors by recoverable ITC at risk', async () => {
    const { data } = await call(ledger.GET, '/api/vendors/ledger');
    expect(data.run.id).toBe(runId);
    const amounts = data.vendors.map((v: { actionableAtRisk: number }) => v.actionableAtRisk);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(data.vendors[0]).toMatchObject({ dunningEligible: true, lastCommunications: [] });
    const eligible = await call(ledger.GET, '/api/vendors/ledger?dunningOnly=true');
    expect(eligible.data.vendors.every((v: { dunningEligible: boolean }) => v.dunningEligible)).toBe(true);
  });

  it('previews, sends, and refuses to resend early', async () => {
    const preview = await call(dispatch.POST, '/api/communications/dispatch', { method: 'POST', body: { dryRun: true } });
    expect(preview.data.previews.length).toBeGreaterThan(0);
    expect((await call(comms.GET, '/api/communications')).data.total).toBe(0);

    const sent = await call(dispatch.POST, '/api/communications/dispatch', { method: 'POST', body: {} });
    expect(sent.status).toBe(200);
    expect(sent.data.failed).toEqual([]);
    const channels = new Set(sent.data.sent.map((s: { channel: string }) => s.channel));
    expect(channels).toEqual(new Set(['EMAIL', 'WHATSAPP']));

    const again = await call(dispatch.POST, '/api/communications/dispatch', { method: 'POST', body: {} });
    expect(again.data.sent).toEqual([]);

    const history = await call(comms.GET, `/api/communications?channel=WHATSAPP`);
    expect(history.data.total).toBe(sent.data.sent.filter((s: { channel: string }) => s.channel === 'WHATSAPP').length);
    expect(history.data.communications[0]).toMatchObject({ status: 'SENT', stage: 0, reply: null });
    expect(JSON.stringify(history.data)).not.toMatch(/statementTokenId|<token>/);

    const top = (await call(ledger.GET, '/api/vendors/ledger')).data.vendors[0];
    const sentFor = sent.data.sent.filter((s: { vendorGstin: string }) => s.vendorGstin === top.gstin).map((s: { channel: string }) => s.channel).sort();
    expect(top.lastCommunications.map((c: { channel: string }) => c.channel).sort()).toEqual(sentFor);
    expect(sentFor).toContain('EMAIL');
  });

  it('sends a one-click reminder to one vendor now', async () => {
    const top = (await call(ledger.GET, '/api/vendors/ledger')).data.vendors[0];
    const { data } = await call(dispatch.POST, '/api/communications/dispatch', {
      method: 'POST',
      body: { vendorIds: [top.id], channels: ['EMAIL'], force: true },
    });
    expect(data.sent).toEqual([expect.objectContaining({ channel: 'EMAIL', stage: 1, vendorGstin: top.gstin })]);
    expect(data.nothingToRemind).toBe(0);
  });

  it('serves the public statement without overridden items or internal ids', async () => {
    const top = (await call(ledger.GET, '/api/vendors/ledger')).data.vendors[0];
    const { data: rows } = await call(results.GET, `/api/reconciliation/${runId}/results?vendorId=${top.id}&status=MISSING_IN_2B,VALUE_MISMATCH,TAX_TYPE_MISMATCH,GSTIN_MISMATCH&pageSize=500`, { params: { id: runId } });
    const resolved = rows.rows[0];
    await call(override.PATCH, '/x', { method: 'PATCH', body: { status: 'EXACT_MATCH', note: 'Confirmed with vendor by phone' }, params: { resultId: resolved.id } });

    const { token } = await createStatementToken(db, {
      organizationId: top.id ? (await db.select().from(schema.vendors).where(eq(schema.vendors.id, top.id)))[0].organizationId : '',
      vendorId: top.id,
      reconciliationRunId: runId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const { status, res, data } = await call(statement.GET, `/api/vendor/statement/${token}`, { params: { token } });
    expect(status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(data).toMatchObject({ vendor: { gstin: top.gstin }, buyer: { gstin: DEMO_ORG.primaryGstin }, financialYear: '2025-2026' });
    expect(data.items).toHaveLength(rows.total - 1);
    expect(data.items.map((i: { invoiceNumber: string }) => i.invoiceNumber)).not.toContain(resolved.prInvoiceNumber);
    expect(JSON.stringify(data)).not.toMatch(/matchResultId|vendorId|organizationId/);

    expect((await call(statement.GET, '/x', { params: { token: 'A'.repeat(43) } })).status).toBe(404);
    expect((await call(statement.GET, '/x', { params: { token: 'short' } })).status).toBe(404);
  });
});
