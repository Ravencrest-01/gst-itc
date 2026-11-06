import { and, between, eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { runIngestionJob } from '../ingestion/db-sink';

/**
 * Source of GSTR-2B statements. The MVP uses `MockGspProvider`; a licensed GSP/ASP
 * integration implements the same interface later without touching callers.
 */
export interface GspProvider {
  readonly name: string;
  /** Returns the portal's GSTR-2B JSON for one GSTIN and return period (MM-YYYY). */
  fetchGstr2b(request: { gstin: string; returnPeriod: string }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Synthetic GSTR-2B generation
// ---------------------------------------------------------------------------

export interface PurchaseDoc {
  supplierGstin: string;
  supplierName?: string | null;
  documentType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  invoiceNumber: string;
  /** YYYY-MM-DD */
  invoiceDate: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

export interface DriftOptions {
  /** PRNG seed; the same seed and input always give the same statement. */
  seed?: number;
  /** Share of invoices the supplier never reported (→ MISSING_IN_2B). Default 0.12 */
  missingRate?: number;
  /** Share reported with a different tax amount (→ VALUE_MISMATCH). Default 0.05 */
  valueMismatchRate?: number;
  /** Share reported under the wrong tax head (→ TAX_TYPE_MISMATCH). Default 0.02 */
  taxTypeRate?: number;
  /** Share reported with reformatted numbers, e.g. "INV/0042" → "42". Default 0.15 */
  reformatRate?: number;
  /** Extra supplier documents not booked by the buyer (→ MISSING_IN_PR), per 100 invoices. Default 3 */
  extraPer100?: number;
  /** Share flagged itcavl = "N". Default 0.01 */
  ineligibleRate?: number;
}

/** Small deterministic PRNG (mulberry32). */
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

const round2 = (n: number) => Math.round(n * 100) / 100;

/** How suppliers commonly re-key the buyer's invoice number in GSTR-1. */
function reformat(no: string, rand: () => number): string {
  const variants = [
    no.replace(/^(INV(OICE)?|BILL)\s*[-/]?\s*/i, ''), // drop prefix
    no.replace(/[/-]/g, (c) => (c === '/' ? '-' : '/')), // swap separators
    no.replace(/(\D|^)0+(\d)/g, '$1$2'), // drop leading zeros
    no.toLowerCase(),
  ].filter((v) => v && v !== no);
  return variants.length ? variants[Math.floor(rand() * variants.length)] : no;
}
const toPortalDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/**
 * Builds a GSTR-2B JSON (portal format) from the buyer's own purchases, applying the
 * kinds of supplier-side errors seen in practice. Lets the whole pipeline run without
 * GSP access.
 */
export function syntheticGstr2b(
  buyerGstin: string,
  returnPeriod: string,
  docs: PurchaseDoc[],
  drift: DriftOptions = {},
): unknown {
  const rand = rng(drift.seed ?? 42);
  const o = {
    missingRate: 0.12,
    valueMismatchRate: 0.05,
    taxTypeRate: 0.02,
    reformatRate: 0.15,
    extraPer100: 3,
    ineligibleRate: 0.01,
    ...drift,
  };

  const b2b = new Map<string, { ctin: string; trdnm: string; inv: Record<string, unknown>[] }>();
  const cdnr = new Map<string, { ctin: string; trdnm: string; nt: Record<string, unknown>[] }>();

  for (const doc of docs) {
    if (rand() < o.missingRate) continue;
    let { igst, cgst, sgst } = doc;
    const r = rand();
    if (r < o.valueMismatchRate) {
      const factor = 0.85 + rand() * 0.1; // under-reported by 5–15%
      igst = round2(igst * factor);
      cgst = round2(cgst * factor);
      sgst = round2(sgst * factor);
    } else if (r < o.valueMismatchRate + o.taxTypeRate) {
      const total = igst + cgst + sgst;
      if (igst > 0) {
        igst = 0;
        cgst = round2(total / 2);
        sgst = round2(total - cgst);
      } else {
        igst = round2(total);
        cgst = 0;
        sgst = 0;
      }
    }
    const number = rand() < o.reformatRate ? reformat(doc.invoiceNumber, rand) : doc.invoiceNumber;
    const entry = {
      dt: toPortalDate(doc.invoiceDate),
      txval: doc.taxableValue,
      igst,
      cgst,
      sgst,
      cess: doc.cess,
      rev: 'N',
      itcavl: rand() < o.ineligibleRate ? 'N' : 'Y',
    };
    const name = doc.supplierName ?? doc.supplierGstin;
    if (doc.documentType === 'INVOICE') {
      const s = b2b.get(doc.supplierGstin) ?? { ctin: doc.supplierGstin, trdnm: name, inv: [] };
      s.inv.push({ inum: number, typ: 'R', ...entry });
      b2b.set(doc.supplierGstin, s);
    } else {
      const s = cdnr.get(doc.supplierGstin) ?? { ctin: doc.supplierGstin, trdnm: name, nt: [] };
      s.nt.push({ ntnum: number, typ: doc.documentType === 'CREDIT_NOTE' ? 'C' : 'D', ...entry });
      cdnr.set(doc.supplierGstin, s);
    }
  }

  // Documents suppliers filed that the buyer never booked.
  const suppliers = [...b2b.values()];
  const extras = Math.round((docs.length * o.extraPer100) / 100);
  for (let i = 0; i < extras && suppliers.length; i++) {
    const s = suppliers[Math.floor(rand() * suppliers.length)];
    const template = s.inv[Math.floor(rand() * s.inv.length)];
    const txval = round2(1_000 + rand() * 49_000);
    const intra = Number(template.igst) === 0;
    s.inv.push({
      ...template,
      inum: `UNB-${returnPeriod.replace('-', '')}-${i + 1}`,
      txval,
      igst: intra ? 0 : round2(txval * 0.18),
      cgst: intra ? round2(txval * 0.09) : 0,
      sgst: intra ? round2(txval * 0.09) : 0,
    });
  }

  return {
    chksum: 'mock',
    data: {
      gstin: buyerGstin,
      rtnprd: returnPeriod.replace('-', ''),
      version: '1.0',
      gendt: toPortalDate(new Date().toISOString().slice(0, 10)),
      docdata: { b2b: suppliers, cdnr: [...cdnr.values()] },
    },
  };
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

export interface MockGspOptions {
  /**
   * Optional folder of real downloads: `<dir>/<GSTIN>/<MMYYYY>.json`. A fixture, when
   * present, is returned as-is; otherwise the generator is used.
   */
  fixturesDir?: string;
  /** Produces a statement when no fixture exists. */
  generate?: (request: { gstin: string; returnPeriod: string }) => Promise<unknown>;
}

export class MockGspProvider implements GspProvider {
  readonly name = 'mock';

  constructor(private readonly options: MockGspOptions = {}) {}

  async fetchGstr2b(request: { gstin: string; returnPeriod: string }): Promise<unknown> {
    if (!/^\d{2}-\d{4}$/.test(request.returnPeriod)) {
      throw new Error(`Return period must be MM-YYYY, got "${request.returnPeriod}"`);
    }
    if (this.options.fixturesDir) {
      const file = path.join(this.options.fixturesDir, request.gstin, `${request.returnPeriod.replace('-', '')}.json`);
      if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
    }
    if (this.options.generate) return this.options.generate(request);
    return syntheticGstr2b(request.gstin, request.returnPeriod, []);
  }
}

/**
 * Mock GSP that derives each month's GSTR-2B from the organization's own purchase
 * register for that month, with supplier-side drift applied.
 */
export function createPurchaseBackedMockGsp(
  db: Db,
  organizationId: string,
  drift: DriftOptions = {},
  fixturesDir?: string,
): MockGspProvider {
  return new MockGspProvider({
    fixturesDir,
    generate: async ({ gstin, returnPeriod }) => {
      const [mm, yyyy] = returnPeriod.split('-');
      const first = `${yyyy}-${mm}-01`;
      const last = new Date(Date.UTC(Number(yyyy), Number(mm), 0)).toISOString().slice(0, 10);
      const rows = await db
        .select()
        .from(schema.purchaseRegisterInvoices)
        .leftJoin(schema.vendors, eq(schema.vendors.id, schema.purchaseRegisterInvoices.vendorId))
        .where(
          and(
            eq(schema.purchaseRegisterInvoices.organizationId, organizationId),
            between(schema.purchaseRegisterInvoices.invoiceDate, first, last),
          ),
        )
        .orderBy(schema.purchaseRegisterInvoices.invoiceDate, schema.purchaseRegisterInvoices.rawInvoiceNumber);
      const docs: PurchaseDoc[] = rows.map(({ purchase_register_invoices: p, vendors: v }) => ({
        supplierGstin: p.supplierGstin,
        supplierName: v?.legalName,
        documentType: p.documentType,
        invoiceNumber: p.rawInvoiceNumber,
        invoiceDate: p.invoiceDate,
        taxableValue: p.taxableValue,
        igst: p.igstAmount,
        cgst: p.cgstAmount,
        sgst: p.sgstAmount,
        cess: p.cessAmount,
      }));
      return syntheticGstr2b(gstin, returnPeriod, docs, { ...drift, seed: (drift.seed ?? 42) + Number(mm) * 31 + Number(yyyy) });
    },
  });
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface SyncResult {
  returnPeriod: string;
  batchId: string;
  written: number;
  error?: string;
}

/** Fetches one period's GSTR-2B and ingests it through the normal upload pipeline. */
export async function syncGstr2b(
  db: Db,
  provider: GspProvider,
  input: { organizationId: string; gstin: string; returnPeriod: string },
): Promise<SyncResult> {
  const json = await provider.fetchGstr2b({ gstin: input.gstin, returnPeriod: input.returnPeriod });
  const { batchId, summary, error } = await runIngestionJob(db, {
    organizationId: input.organizationId,
    source: 'GSTR2B',
    fileName: `GSTR2B_${input.gstin}_${input.returnPeriod.replace('-', '')}_${provider.name}.json`,
    input: JSON.stringify(json),
  });
  return { returnPeriod: input.returnPeriod, batchId, written: summary?.writtenCount ?? 0, error };
}

/** The 12 return periods of a financial year: "2025-2026" → 04-2025 … 03-2026. */
export function returnPeriodsOf(financialYear: string): string[] {
  const start = Number(financialYear.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((i + 3) % 12) + 1;
    return `${String(m).padStart(2, '0')}-${m >= 4 ? start : start + 1}`;
  });
}

/** Syncs every period of a financial year that is not in the future. */
export async function syncFinancialYear(
  db: Db,
  provider: GspProvider,
  input: { organizationId: string; gstin: string; financialYear: string; asOf?: string },
): Promise<SyncResult[]> {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const out: SyncResult[] = [];
  for (const period of returnPeriodsOf(input.financialYear)) {
    const [mm, yyyy] = period.split('-');
    if (`${yyyy}-${mm}-01` > asOf) break;
    out.push(await syncGstr2b(db, provider, { ...input, returnPeriod: period }));
  }
  return out;
}
