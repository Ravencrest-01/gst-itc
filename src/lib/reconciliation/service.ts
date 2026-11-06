import { and, between, eq, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { fromEpochDay, fyEndYear, toEpochDay } from '../gst/fiscal';
import { aggregateByVendor } from './aggregate';
import { reconcile, summarize } from './engine';
import type { InvoiceInput, ReconcileOptions, ReconcileSummary, VendorExposure } from './types';

export interface RunReconciliationInput {
  organizationId: string;
  /** "2025-2026" */
  financialYear: string;
  /** Section 16(4) clock date (YYYY-MM-DD). Defaults to today. */
  asOf?: string;
  options?: Omit<ReconcileOptions, 'asOf'>;
  createdByUserId?: string;
}

export interface RunReconciliationResult {
  runId: string;
  summary: ReconcileSummary;
  vendors: VendorExposure[];
}

const INSERT_CHUNK = 1_000;

type InvoiceRow = typeof schema.purchaseRegisterInvoices.$inferSelect | typeof schema.gstr2bInvoices.$inferSelect;

const toInput = (r: InvoiceRow): InvoiceInput & { itcAvailable?: boolean } => ({
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
  itcAvailable: 'itcAvailable' in r ? r.itcAvailable : undefined,
});

/**
 * Loads one financial year of PR and GSTR-2B data, runs the engine, and stores the run,
 * every match result, and refreshed vendor risk tiers / compliance scores.
 */
export async function runReconciliation(db: Db, input: RunReconciliationInput): Promise<RunReconciliationResult> {
  const { organizationId, financialYear } = input;
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const window = input.options?.dateWindowDays ?? 30;
  const endYear = fyEndYear(financialYear);

  const [run] = await db
    .insert(schema.reconciliationRuns)
    .values({
      organizationId,
      financialYear,
      asOfDate: asOf,
      status: 'PROCESSING',
      params: { ...input.options },
      createdByUserId: input.createdByUserId,
    })
    .returning({ id: schema.reconciliationRuns.id });

  try {
    const prRows = await db
      .select()
      .from(schema.purchaseRegisterInvoices)
      .where(
        and(
          eq(schema.purchaseRegisterInvoices.organizationId, organizationId),
          eq(schema.purchaseRegisterInvoices.financialYear, financialYear),
        ),
      );
    // 2B rows just outside the FY are loaded so Pass 2 can pair invoices dated around
    // 31 March / 1 April; any of them left unmatched are dropped below.
    const from = fromEpochDay(toEpochDay(`${endYear - 1}-04-01`) - window);
    const to = fromEpochDay(toEpochDay(`${endYear}-03-31`) + window);
    const b2bRows = await db
      .select()
      .from(schema.gstr2bInvoices)
      .where(
        and(
          eq(schema.gstr2bInvoices.organizationId, organizationId),
          or(
            eq(schema.gstr2bInvoices.financialYear, financialYear),
            between(schema.gstr2bInvoices.invoiceDate, from, to),
          ),
        ),
      );

    const { results: allResults, summary: engineSummary } = reconcile(prRows.map(toInput), b2bRows.map(toInput), { ...input.options, asOf });
    const b2bById = new Map(b2bRows.map((r) => [r.id, r]));
    const prById = new Map(prRows.map((r) => [r.id, r]));
    const results = allResults.filter(
      (r) => r.status !== 'MISSING_IN_PR' || b2bById.get(r.gstr2bId!)?.financialYear === financialYear,
    );
    const inScope2b = new Set(results.flatMap((r) => (r.gstr2bId ? [r.gstr2bId] : [])));

    // Re-summarize on the filtered set so out-of-FY 2B rows don't count.
    const summary = summarize(results, prRows.length, inScope2b.size, engineSummary.invalidGstins);
    const vendors = aggregateByVendor(results);

    const vendorIdByGstin = new Map<string, string>();
    for (const r of prRows) vendorIdByGstin.set(r.supplierGstin, r.vendorId);
    for (const r of b2bRows) if (r.vendorId && !vendorIdByGstin.has(r.supplierGstin)) vendorIdByGstin.set(r.supplierGstin, r.vendorId);

    const rows = results.map((r) => ({
      organizationId,
      reconciliationRunId: run.id,
      vendorId: (r.prId ? prById.get(r.prId)?.vendorId : undefined) ?? vendorIdByGstin.get(r.gstin) ?? null,
      supplierGstin: r.gstin,
      prInvoiceId: r.prId,
      gstr2bInvoiceId: r.gstr2bId,
      matchStatus: r.status,
      matchPass: r.pass,
      confidence: r.confidence,
      taxableDifference: r.taxableDifference,
      taxDifference: r.taxDifference,
      itcAtRisk: r.itcAtRisk,
      itcOpportunity: r.itcOpportunity,
      financialYear: r.financialYear,
      section164Deadline: r.section164Deadline,
      isSection164Risk: r.isSection164Risk,
      isItcLapsed: r.isItcLapsed,
      riskTier: r.riskTier,
      notes: r.notes.length ? r.notes.join('\n') : null,
    }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await db.insert(schema.matchResults).values(rows.slice(i, i + INSERT_CHUNK));
    }

    await updateVendorScores(db, organizationId, vendors);

    await db
      .update(schema.reconciliationRuns)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        totalPrCount: summary.totalPr,
        total2bCount: summary.total2b,
        exactMatchesCount: summary.exactMatches,
        mismatchesCount: summary.mismatches,
        totalItcAtRisk: summary.totalItcAtRisk,
        totalItcOpportunity: summary.totalItcOpportunity,
        section164RiskAmount: summary.section164RiskAmount,
      })
      .where(eq(schema.reconciliationRuns.id, run.id));

    return { runId: run.id, summary, vendors };
  } catch (err) {
    await db
      .update(schema.reconciliationRuns)
      .set({ status: 'FAILED', completedAt: new Date(), params: { ...input.options, error: String(err) } })
      .where(eq(schema.reconciliationRuns.id, run.id));
    throw err;
  }
}

async function updateVendorScores(db: Db, organizationId: string, vendors: VendorExposure[]) {
  const ids = await db
    .select({ id: schema.vendors.id, gstin: schema.vendors.gstin })
    .from(schema.vendors)
    .where(
      and(
        eq(schema.vendors.organizationId, organizationId),
        inArray(schema.vendors.gstin, vendors.map((v) => v.gstin).concat('')),
      ),
    );
  const idByGstin = new Map(ids.map((v) => [v.gstin, v.id]));
  const updates = vendors.filter((v) => idByGstin.has(v.gstin));
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const values = sql.join(
      chunk.map((v) => sql`(${idByGstin.get(v.gstin)}::uuid, ${v.riskTier}::risk_tier, ${v.complianceScore}::numeric)`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE vendors AS v
         SET risk_tier = x.tier, compliance_score = x.score
        FROM (VALUES ${values}) AS x(id, tier, score)
       WHERE v.id = x.id`);
  }
}
