import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../db/schema';
import { gstinCheckDigit } from '../gst/gstin';
import { reconcile } from '../reconciliation/engine';
import { runIngestionJob, type Db } from './db-sink';

const gstin = (state: string, pan: string) => {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
};
const ACME = gstin('27', 'AAACB9812R');
const ORION = gstin('33', 'AAACG1122R');

let db: Db;
let orgId: string;

beforeAll(async () => {
  const client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder: 'drizzle' });
  db = pg as unknown as Db;
  const [org] = await db
    .insert(schema.organizations)
    .values({ legalName: 'Demo Mfg', primaryGstin: gstin('27', 'AABCD1234E') })
    .returning();
  orgId = org.id;
}, 60_000);

const PR_CSV = (igst: number) =>
  [
    'GSTIN,Party Name,Invoice No,Invoice Date,Taxable Value,IGST,CGST,SGST',
    `${ACME},Acme Logistics,INV-1,10-08-2025,100000,${igst},,`,
    `${ACME},Acme Logistics,INV-2,12-08-2025,5000,900,,`,
    `${ORION},Orion Traders,OR-12,15-08-2025,5000,,450,450`,
  ].join('\n');

describe('runIngestionJob (Postgres via PGlite)', () => {
  it('creates vendors, inserts invoices and completes the batch', async () => {
    const { batchId, summary, error } = await runIngestionJob(db, {
      organizationId: orgId,
      source: 'PURCHASE_REGISTER',
      fileName: 'pr.csv',
      input: PR_CSV(18_000),
    });
    expect(error).toBeUndefined();
    expect(summary?.writtenCount).toBe(3);

    const vendors = await db.select().from(schema.vendors).where(eq(schema.vendors.organizationId, orgId));
    expect(vendors.map((v) => [v.gstin, v.legalName]).sort()).toEqual(
      [[ACME, 'Acme Logistics'], [ORION, 'Orion Traders']].sort(),
    );

    const [batch] = await db.select().from(schema.ingestionBatches).where(eq(schema.ingestionBatches.id, batchId));
    expect(batch).toMatchObject({ status: 'COMPLETED', rowCount: 3, insertedCount: 3, errorCount: 0 });
    expect(batch.columnMapping).toMatchObject({ supplierGstin: 'GSTIN', invoiceNumber: 'Invoice No' });

    const [inv] = await db
      .select()
      .from(schema.purchaseRegisterInvoices)
      .where(eq(schema.purchaseRegisterInvoices.rawInvoiceNumber, 'INV-1'));
    expect(inv).toMatchObject({ taxableValue: 100_000, igstAmount: 18_000, totalTax: 18_000, financialYear: '2025-2026' });
  });

  it('is idempotent: re-uploading updates rows instead of duplicating them', async () => {
    await runIngestionJob(db, { organizationId: orgId, source: 'PURCHASE_REGISTER', fileName: 'pr-v2.csv', input: PR_CSV(17_500) });
    const rows = await db.select().from(schema.purchaseRegisterInvoices);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.rawInvoiceNumber === 'INV-1')?.igstAmount).toBe(17_500);
  });

  it('applies GSTR-2B amendments by replacing the original document', async () => {
    const json = {
      data: {
        rtnprd: '082025',
        docdata: {
          b2b: [
            {
              ctin: ACME,
              trdnm: 'Acme Logistics',
              inv: [
                { inum: 'INV-1', dt: '10-08-2025', txval: 100_000, igst: 18_000 },
                { inum: 'INV-2', dt: '12-08-2025', txval: 5_000, igst: 900 },
              ],
            },
          ],
          b2ba: [{ ctin: ACME, inv: [{ oinum: 'INV-2', oidt: '12-08-2025', inum: 'INV-2R', dt: '12-08-2025', txval: 5_000, igst: 900 }] }],
          cdnr: [],
        },
      },
    };
    const { summary, error } = await runIngestionJob(db, {
      organizationId: orgId,
      source: 'GSTR2B',
      fileName: '2b.json',
      input: JSON.stringify(json),
    });
    expect(error).toBeUndefined();
    expect(summary?.writtenCount).toBe(3);
    const rows = await db.select().from(schema.gstr2bInvoices);
    expect(rows.map((r) => r.rawInvoiceNumber).sort()).toEqual(['INV-1', 'INV-2R']);
    expect(rows.find((r) => r.rawInvoiceNumber === 'INV-2R')).toMatchObject({ isAmendment: true, returnPeriod: '08-2025' });
  });

  it('feeds the reconciliation engine end to end', async () => {
    const pr = await db.select().from(schema.purchaseRegisterInvoices);
    const b2b = await db.select().from(schema.gstr2bInvoices);
    const toInput = (r: (typeof pr)[number] | (typeof b2b)[number]) => ({
      id: r.id,
      gstin: r.supplierGstin,
      invoiceNumber: r.rawInvoiceNumber,
      invoiceDate: r.invoiceDate,
      documentType: r.documentType,
      taxableValue: r.taxableValue,
      igst: r.igstAmount,
      cgst: r.cgstAmount,
      sgst: r.sgstAmount,
      cess: r.cessAmount,
    });
    const { results } = reconcile(pr.map(toInput), b2b.map(toInput), { asOf: '2026-11-06' });
    const status = (no: string) => results.find((r) => pr.find((p) => p.id === r.prId)?.rawInvoiceNumber === no)?.status;
    expect(status('INV-1')).toBe('VALUE_MISMATCH'); // 17,500 booked vs 18,000 reported
    // Supplier amended INV-2 to INV-2R: "2" vs "2R" is too different to fuzzy-match.
    expect(status('INV-2')).toBe('MISSING_IN_2B');
    expect(status('OR-12')).toBe('MISSING_IN_2B');
    const amended = results.find((r) => b2b.find((b) => b.id === r.gstr2bId)?.rawInvoiceNumber === 'INV-2R');
    expect(amended).toMatchObject({ status: 'MISSING_IN_PR', itcOpportunity: 900 });
  });

  it('marks the batch FAILED with the reason when the file is unusable', async () => {
    const { batchId, error } = await runIngestionJob(db, {
      organizationId: orgId,
      source: 'PURCHASE_REGISTER',
      fileName: 'empty.csv',
      input: 'nothing,useful\n1,2',
    });
    expect(error).toMatch(/No invoice rows/);
    const [batch] = await db.select().from(schema.ingestionBatches).where(eq(schema.ingestionBatches.id, batchId));
    expect(batch.status).toBe('FAILED');
    expect(batch.errors?.[0].message).toMatch(/No invoice rows/);
  });
});
