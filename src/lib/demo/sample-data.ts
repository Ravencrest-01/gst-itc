import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { gstinCheckDigit } from '../gst/gstin';
import { runIngestionJob } from '../ingestion/db-sink';

export const gstinFor = (stateCode: string, pan: string) => {
  const first14 = `${stateCode}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
};

export const DEMO_ORG = {
  legalName: 'Demo Manufacturing Pvt Ltd',
  tradeName: 'DemoMfg',
  primaryGstin: gstinFor('27', 'AABCD1234E'), // Maharashtra
};

export const DEMO_USERS = [
  { email: 'finance@demomfg.example', fullName: 'Priya Sharma', role: 'FINANCE_MANAGER' as const },
  { email: 'cfo@demomfg.example', fullName: 'Arjun Mehta', role: 'ADMIN' as const },
  { email: 'audit@demomfg.example', fullName: 'Audit Desk', role: 'AUDITOR' as const },
];

/** Same state code as the buyer (27) means CGST+SGST; any other state means IGST. */
export const DEMO_VENDORS = [
  { state: '27', pan: 'AAACB9812R', legalName: 'Acme Logistics Pvt Ltd', contactName: 'Rahul Verma', prefix: 'INV/' },
  { state: '07', pan: 'AAACC4455K', legalName: 'Cyberdyne Systems LLP', contactName: 'Meera Iyer', prefix: 'CD-' },
  { state: '33', pan: 'AAACG1122R', legalName: 'Orion Traders', contactName: 'S. Karthik', prefix: 'OR-' },
  { state: '27', pan: 'AAFCP7788M', legalName: 'Pune Packaging Co', contactName: 'Neha Kulkarni', prefix: 'PPC/' },
  { state: '24', pan: 'AABCS3344L', legalName: 'Surat Textiles Ltd', contactName: 'Hardik Patel', prefix: 'ST' },
  { state: '29', pan: 'AAGCB5566P', legalName: 'Bengaluru Electronics Pvt Ltd', contactName: 'Divya Rao', prefix: 'BE-' },
  { state: '27', pan: 'AAHCN9900Q', legalName: 'Nashik Agro Inputs', contactName: null, prefix: 'NAI/' },
  { state: '06', pan: 'AAICG2211T', legalName: 'Gurgaon Freight Movers', contactName: 'Amit Yadav', prefix: 'GFM' },
  { state: '27', pan: 'AAJCM6677U', legalName: 'Mumbai Office Supplies', contactName: 'Fatima Shaikh', prefix: 'MOS-' },
  { state: '19', pan: 'AAKCK8899V', legalName: 'Kolkata Jute Mills', contactName: 'Sourav Das', prefix: 'KJM/' },
  { state: '27', pan: 'AALCT1100W', legalName: 'Thane Tooling Works', contactName: 'Vikram Joshi', prefix: 'TTW-' },
  // No email on file: shows the "no contact email" path.
  { state: '36', pan: 'AAMCH3322X', legalName: 'Hyderabad Chemicals', contactName: null, prefix: 'HC', noEmail: true },
].map((v) => ({
  ...v,
  gstin: gstinFor(v.state, v.pan),
  contactEmail: 'noEmail' in v && v.noEmail ? null : `accounts@${v.legalName.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-(pvt-ltd|ltd|llp|co)$/, '')}.example`,
}));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A purchase register CSV in Tally-like layout (title rows, Indian number formats) for one
 * financial year. Deterministic for a given seed.
 */
export function samplePurchaseRegisterCsv(financialYear = '2025-2026', invoicesPerVendor = 24, seed = 7): string {
  const rand = rng(seed);
  const start = Number(financialYear.slice(0, 4));
  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines = [
    `${DEMO_ORG.legalName}`,
    `Purchase Register 1-Apr-${start} to 31-Mar-${start + 1}`,
    '',
    'Date,Particulars,Supplier Invoice No.,GSTIN/UIN,Voucher Type,Taxable Value,IGST,CGST,SGST',
  ];
  DEMO_VENDORS.forEach((v, vi) => {
    for (let i = 0; i < invoicesPerVendor; i++) {
      const month = i % 12; // Apr..Mar
      const y = month < 9 ? start : start + 1;
      const m = ((month + 3) % 12) + 1;
      const d = 1 + Math.floor(rand() * 27);
      const date = `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
      const isCredit = i === invoicesPerVendor - 1 && vi % 4 === 0;
      const taxable = Math.round((5_000 + rand() * 195_000) * 100) / 100;
      const rate = [0.05, 0.12, 0.18, 0.18, 0.28][Math.floor(rand() * 5)];
      const tax = Math.round(taxable * rate * 100) / 100;
      const intra = v.state === '27';
      const half = Math.round((tax / 2) * 100) / 100;
      const sign = isCredit ? -1 : 1;
      const amt = (n: number) => (n ? fmt(sign * n) : '');
      const no = isCredit ? `CN-${vi + 1}-${i + 1}` : `${v.prefix}${String(100 + vi * 50 + i).padStart(5, '0')}`;
      lines.push(
        [date, `"${v.legalName}"`, no, v.gstin, isCredit ? 'Debit Note' : 'Purchase', `"${amt(taxable)}"`, `"${amt(intra ? 0 : tax)}"`, `"${amt(intra ? half : 0)}"`, `"${amt(intra ? tax - half : 0)}"`].join(','),
      );
    }
  });
  return lines.join('\r\n');
}

/**
 * Creates (or reuses) the demo organization, its users and vendor contacts, and ingests a
 * year of purchases through the normal upload pipeline. Idempotent.
 */
export async function seedDemoOrganization(db: Db, financialYear = '2025-2026') {
  const [org] = await db
    .insert(schema.organizations)
    .values(DEMO_ORG)
    .onConflictDoUpdate({ target: schema.organizations.primaryGstin, set: { legalName: DEMO_ORG.legalName } })
    .returning();
  await db
    .insert(schema.users)
    .values(DEMO_USERS.map((u) => ({ ...u, organizationId: org.id })))
    .onConflictDoNothing();

  const ingestion = await runIngestionJob(db, {
    organizationId: org.id,
    source: 'PURCHASE_REGISTER',
    fileName: `purchase-register-${financialYear}.csv`,
    input: samplePurchaseRegisterCsv(financialYear),
  });

  // The upload created vendors from the file; add the contact details a finance team keeps.
  for (const v of DEMO_VENDORS) {
    await db
      .update(schema.vendors)
      .set({ legalName: v.legalName, contactName: v.contactName, contactEmail: v.contactEmail })
      .where(eq(schema.vendors.gstin, v.gstin));
  }
  return { org, ingestion };
}
