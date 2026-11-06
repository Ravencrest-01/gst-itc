import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Readable } from 'node:stream';
import type { Db } from '../../db/client';
import * as schema from '../../db/schema';
import { ingestFile, IngestionError, type IngestOptions } from './pipeline';
import type { ColumnMapping, IngestionSink, IngestionSource, IngestionSummary, NormalizedRow } from './types';

export type { Db };

export interface DbSinkOptions {
  organizationId: string;
  source: IngestionSource;
  batchId?: string;
}

/**
 * Persists normalized rows. Unknown supplier GSTINs become vendors (named from the file,
 * or the GSTIN as a placeholder). Invoices upsert on (organization_id, normalization_hash),
 * so re-uploading a file updates rows instead of duplicating them.
 */
export function createDbSink(db: Db, { organizationId, source, batchId }: DbSinkOptions): IngestionSink {
  const vendorIds = new Map<string, string>();

  async function resolveVendors(rows: NormalizedRow[]) {
    const missing = new Map<string, string>();
    for (const r of rows) {
      if (!vendorIds.has(r.supplierGstin) && !missing.has(r.supplierGstin)) {
        missing.set(r.supplierGstin, r.supplierName ?? r.supplierGstin);
      }
    }
    if (!missing.size) return;
    await db
      .insert(schema.vendors)
      .values([...missing].map(([gstin, legalName]) => ({ organizationId, gstin, legalName })))
      .onConflictDoNothing({ target: [schema.vendors.organizationId, schema.vendors.gstin] });
    const found = await db
      .select({ id: schema.vendors.id, gstin: schema.vendors.gstin })
      .from(schema.vendors)
      .where(and(eq(schema.vendors.organizationId, organizationId), inArray(schema.vendors.gstin, [...missing.keys()])));
    for (const v of found) vendorIds.set(v.gstin, v.id);
  }

  const common = (r: NormalizedRow) => ({
    organizationId,
    batchId: batchId ?? null,
    vendorId: vendorIds.get(r.supplierGstin)!,
    supplierGstin: r.supplierGstin,
    documentType: r.documentType,
    rawInvoiceNumber: r.rawInvoiceNumber,
    normalizedInvoiceNumber: r.normalizedInvoiceNumber,
    coreInvoiceNumber: r.coreInvoiceNumber,
    invoiceDate: r.invoiceDate,
    financialYear: r.financialYear,
    taxableValue: r.taxableValue,
    igstAmount: r.igst,
    cgstAmount: r.cgst,
    sgstAmount: r.sgst,
    cessAmount: r.cess,
    normalizationHash: r.normalizationHash,
  });

  /** Columns overwritten when a re-upload hits an existing row. */
  const updatable = [
    'batch_id', 'vendor_id', 'raw_invoice_number', 'core_invoice_number', 'invoice_date',
    'taxable_value', 'igst_amount', 'cgst_amount', 'sgst_amount', 'cess_amount',
  ];
  const excluded = (cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase()), sql.raw(`excluded.${c}`)]));

  return {
    async write(rows) {
      await resolveVendors(rows);
      if (source === 'PURCHASE_REGISTER') {
        await db
          .insert(schema.purchaseRegisterInvoices)
          .values(rows.map(common))
          .onConflictDoUpdate({
            target: [schema.purchaseRegisterInvoices.organizationId, schema.purchaseRegisterInvoices.normalizationHash],
            set: excluded(updatable),
          });
      } else {
        await db
          .insert(schema.gstr2bInvoices)
          .values(
            rows.map((r) => ({
              ...common(r),
              supplierTradeName: r.supplierName,
              returnPeriod: r.returnPeriod!,
              isAmendment: r.isAmendment,
              reverseCharge: r.reverseCharge,
              itcAvailable: r.itcAvailable,
            })),
          )
          .onConflictDoUpdate({
            target: [schema.gstr2bInvoices.organizationId, schema.gstr2bInvoices.normalizationHash],
            set: excluded([
              ...updatable, 'supplier_trade_name', 'return_period', 'is_amendment', 'reverse_charge', 'itc_available',
            ]),
          });
        const superseded = rows.flatMap((r) => (r.supersedesHash ? [r.supersedesHash] : []));
        if (superseded.length) {
          await db
            .delete(schema.gstr2bInvoices)
            .where(
              and(
                eq(schema.gstr2bInvoices.organizationId, organizationId),
                inArray(schema.gstr2bInvoices.normalizationHash, superseded),
              ),
            );
        }
      }
      return rows.length;
    },
  };
}

export interface RunIngestionJobInput {
  organizationId: string;
  source: IngestionSource;
  fileName: string;
  input: Readable | Buffer | string;
  blobUrl?: string;
  mapping?: ColumnMapping;
  createdByUserId?: string;
  batchSize?: IngestOptions['batchSize'];
}

/**
 * Records an `ingestion_batches` row, streams the file into the invoice tables, and marks
 * the batch COMPLETED or FAILED with the first row-level errors attached.
 */
export async function runIngestionJob(
  db: Db,
  job: RunIngestionJobInput,
): Promise<{ batchId: string; summary: IngestionSummary | null; error?: string }> {
  const [batch] = await db
    .insert(schema.ingestionBatches)
    .values({
      organizationId: job.organizationId,
      source: job.source,
      fileName: job.fileName.slice(0, 255),
      blobUrl: job.blobUrl,
      status: 'PROCESSING',
      columnMapping: job.mapping,
      createdByUserId: job.createdByUserId,
    })
    .returning({ id: schema.ingestionBatches.id });

  try {
    const summary = await ingestFile(job.fileName, job.input, {
      source: job.source,
      mapping: job.mapping,
      batchSize: job.batchSize,
      sink: createDbSink(db, { organizationId: job.organizationId, source: job.source, batchId: batch.id }),
    });
    await db
      .update(schema.ingestionBatches)
      .set({
        status: summary.writtenCount > 0 || summary.errorCount === 0 ? 'COMPLETED' : 'FAILED',
        rowCount: summary.rowCount,
        insertedCount: summary.writtenCount,
        errorCount: summary.errorCount,
        errors: summary.errors,
        columnMapping: summary.mappings[''] ?? Object.values(summary.mappings)[0] ?? job.mapping,
        completedAt: new Date(),
      })
      .where(eq(schema.ingestionBatches.id, batch.id));
    return { batchId: batch.id, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const partial = err instanceof IngestionError ? err.summary : undefined;
    await db
      .update(schema.ingestionBatches)
      .set({
        status: 'FAILED',
        rowCount: partial?.rowCount ?? 0,
        insertedCount: partial?.writtenCount ?? 0,
        errorCount: (partial?.errorCount ?? 0) + 1,
        errors: [...(partial?.errors ?? []), { row: 0, message }],
        completedAt: new Date(),
      })
      .where(eq(schema.ingestionBatches.id, batch.id));
    return { batchId: batch.id, summary: partial ?? null, error: message };
  }
}
