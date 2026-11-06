/**
 * Seeds one sample tenant with vendors, a purchase register and GSTR-2B rows that
 * exercise every match status. Idempotent. Usage: pnpm db:seed (needs DATABASE_URL).
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getDb, schema } from '../src/db/client';
import { financialYearOf } from '../src/lib/gst/fiscal';
import { gstinCheckDigit } from '../src/lib/gst/gstin';
import {
  canonicalInvoiceNumber,
  coreInvoiceNumber,
  normalizationHash,
} from '../src/lib/gst/normalization';
import type { DocumentType } from '../src/lib/reconciliation/types';

const gstin = (state: string, pan: string) => {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
};

const ORG_GSTIN = gstin('27', 'AABCD1234E');
const VENDORS = [
  { gstin: gstin('27', 'AAACB9812R'), legalName: 'Acme Logistics Pvt Ltd', contactEmail: 'ap@acme.example' },
  { gstin: gstin('07', 'AAACC0000A'), legalName: 'Cyberdyne Systems LLP', contactEmail: 'gst@cyberdyne.example' },
  { gstin: gstin('33', 'AAACG1122R'), legalName: 'Orion Traders', contactPhone: '+919800000000' },
  { gstin: gstin('29', 'AAACB9812R'), legalName: 'Acme Logistics Pvt Ltd (KA)' },
];

type Row = {
  vendor: number;
  no: string;
  date: string;
  taxable: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  doc?: DocumentType;
};

const PR: Row[] = [
  { vendor: 0, no: 'INV-8841', date: '2025-07-14', taxable: 251_111.11, igst: 45_200 }, // missing in 2B
  { vendor: 1, no: 'CD-9902', date: '2025-08-02', taxable: 71_111.11, igst: 12_800 }, // value mismatch
  { vendor: 2, no: 'OR-0012', date: '2025-09-19', taxable: 46_666.67, cgst: 4_200, sgst: 4_200 }, // exact
  { vendor: 2, no: 'INV/000452', date: '2025-10-01', taxable: 10_000, cgst: 900, sgst: 900 }, // prefix -> pass 2
  { vendor: 1, no: 'CD-9950', date: '2025-11-05', taxable: 10_000, igst: 1_800 }, // tax type mismatch
  { vendor: 0, no: 'INV-9001', date: '2025-12-12', taxable: 20_000, igst: 3_600 }, // GSTIN mismatch (2B under KA)
];

const B2B: (Row & { period: string })[] = [
  { vendor: 1, no: 'CD-9902', date: '2025-08-02', taxable: 66_666.67, igst: 12_000, period: '08-2025' },
  { vendor: 2, no: 'OR-12', date: '2025-09-19', taxable: 46_666.67, cgst: 4_200, sgst: 4_200, period: '09-2025' },
  { vendor: 2, no: '452', date: '2025-10-01', taxable: 10_000, cgst: 900, sgst: 900, period: '10-2025' },
  { vendor: 1, no: 'CD-9950', date: '2025-11-05', taxable: 10_000, cgst: 900, sgst: 900, period: '11-2025' },
  { vendor: 3, no: 'INV-9001', date: '2025-12-12', taxable: 20_000, igst: 3_600, period: '12-2025' },
  { vendor: 2, no: 'OR-0077', date: '2026-01-08', taxable: 5_000, cgst: 450, sgst: 450, period: '01-2026' }, // missing in PR
];

function normalized(vendorGstin: string, r: Row) {
  const doc = r.doc ?? 'INVOICE';
  const fy = financialYearOf(r.date);
  const canonical = canonicalInvoiceNumber(r.no);
  return {
    supplierGstin: vendorGstin,
    documentType: doc,
    rawInvoiceNumber: r.no,
    normalizedInvoiceNumber: canonical,
    coreInvoiceNumber: coreInvoiceNumber(r.no),
    invoiceDate: r.date,
    financialYear: fy,
    taxableValue: r.taxable,
    igstAmount: r.igst ?? 0,
    cgstAmount: r.cgst ?? 0,
    sgstAmount: r.sgst ?? 0,
    cessAmount: 0,
    normalizationHash: normalizationHash(vendorGstin, doc, canonical, fy),
  };
}

async function main() {
  const db = getDb();

  const [org] = await db
    .insert(schema.organizations)
    .values({ legalName: 'Demo Manufacturing Pvt Ltd', tradeName: 'DemoMfg', primaryGstin: ORG_GSTIN })
    .onConflictDoUpdate({ target: schema.organizations.primaryGstin, set: { legalName: sql`excluded.legal_name` } })
    .returning();

  await db
    .insert(schema.users)
    .values({ organizationId: org.id, email: 'finance@demomfg.example', fullName: 'Demo Finance Manager' })
    .onConflictDoNothing();

  const vendorRows = await db
    .insert(schema.vendors)
    .values(VENDORS.map((v) => ({ ...v, organizationId: org.id })))
    .onConflictDoUpdate({
      target: [schema.vendors.organizationId, schema.vendors.gstin],
      set: { legalName: sql`excluded.legal_name` },
    })
    .returning();
  const vendorId = new Map(vendorRows.map((v) => [v.gstin, v.id]));

  await db
    .insert(schema.purchaseRegisterInvoices)
    .values(
      PR.map((r) => {
        const g = VENDORS[r.vendor].gstin;
        return { ...normalized(g, r), organizationId: org.id, vendorId: vendorId.get(g)! };
      }),
    )
    .onConflictDoNothing();

  await db
    .insert(schema.gstr2bInvoices)
    .values(
      B2B.map((r) => {
        const g = VENDORS[r.vendor].gstin;
        return {
          ...normalized(g, r),
          organizationId: org.id,
          vendorId: vendorId.get(g) ?? null,
          returnPeriod: r.period,
        };
      }),
    )
    .onConflictDoNothing();

  console.log(`Seeded org ${org.legalName} (${org.id}): ${VENDORS.length} vendors, ${PR.length} PR, ${B2B.length} 2B rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
