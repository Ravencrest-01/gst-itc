import ExcelJS from 'exceljs';
import { PassThrough, Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { ResultRow } from './results';

/** Export columns, in order. Amounts are numbers so spreadsheets can total them. */
export const EXPORT_COLUMNS: { header: string; key: string; width: number; value: (r: ResultRow) => string | number | null }[] = [
  { header: 'Vendor', key: 'vendor', width: 32, value: (r) => r.vendorName as string | null },
  { header: 'Supplier GSTIN', key: 'gstin', width: 18, value: (r) => r.supplierGstin as string },
  { header: 'Status', key: 'status', width: 18, value: (r) => r.status as string },
  { header: 'Engine status', key: 'matchStatus', width: 18, value: (r) => r.matchStatus as string },
  { header: 'Override', key: 'override', width: 18, value: (r) => (r.overrideStatus as string | null) ?? '' },
  { header: 'PR invoice no.', key: 'prNo', width: 18, value: (r) => r.prInvoiceNumber as string | null },
  { header: 'PR invoice date', key: 'prDate', width: 12, value: (r) => r.prInvoiceDate as string | null },
  { header: 'PR taxable value', key: 'prTaxable', width: 14, value: (r) => r.prTaxableValue as number | null },
  { header: 'PR tax', key: 'prTax', width: 12, value: (r) => r.prTotalTax as number | null },
  { header: 'GSTR-2B invoice no.', key: 'b2bNo', width: 18, value: (r) => r.gstr2bInvoiceNumber as string | null },
  { header: 'GSTR-2B invoice date', key: 'b2bDate', width: 12, value: (r) => r.gstr2bInvoiceDate as string | null },
  { header: 'GSTR-2B taxable value', key: 'b2bTaxable', width: 14, value: (r) => r.gstr2bTaxableValue as number | null },
  { header: 'GSTR-2B tax', key: 'b2bTax', width: 12, value: (r) => r.gstr2bTotalTax as number | null },
  { header: 'GSTR-2B period', key: 'b2bPeriod', width: 10, value: (r) => r.gstr2bReturnPeriod as string | null },
  { header: 'Tax difference (PR - 2B)', key: 'taxDiff', width: 14, value: (r) => r.taxDifference as number },
  { header: 'ITC at risk', key: 'atRisk', width: 14, value: (r) => r.itcAtRisk as number },
  { header: 'ITC not booked', key: 'opportunity', width: 14, value: (r) => r.itcOpportunity as number },
  { header: 'Sec 16(4) deadline', key: 'deadline', width: 12, value: (r) => r.section164Deadline as string },
  { header: 'Sec 16(4) risk', key: 'risk164', width: 10, value: (r) => (r.isSection164Risk ? 'Yes' : 'No') },
  { header: 'ITC lapsed', key: 'lapsed', width: 10, value: (r) => (r.isItcLapsed ? 'Yes' : 'No') },
  { header: 'Risk tier', key: 'tier', width: 10, value: (r) => r.riskTier as string },
  { header: 'Notes', key: 'notes', width: 60, value: (r) => (r.notes as string | null) ?? '' },
];

function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  // Neutralise spreadsheet formulas in text that came from uploaded files.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const encoder = new TextEncoder();

/** CSV as a web stream; pulls the next chunk of rows only when the client reads. */
export function csvStream(chunks: AsyncGenerator<ResultRow[]>): ReadableStream<Uint8Array> {
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        // BOM so Excel opens UTF-8 (₹, names) correctly.
        controller.enqueue(encoder.encode(`﻿${EXPORT_COLUMNS.map((c) => csvCell(c.header)).join(',')}\r\n`));
        return;
      }
      const { value, done } = await chunks.next();
      if (done) {
        controller.close();
        return;
      }
      const text = value.map((r) => EXPORT_COLUMNS.map((c) => csvCell(c.value(r))).join(',')).join('\r\n');
      controller.enqueue(encoder.encode(`${text}\r\n`));
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

/** XLSX written row by row with ExcelJS's streaming writer (reading is not streamed; writing is reliable). */
export function xlsxStream(chunks: AsyncGenerator<ResultRow[]>, sheetName = 'Reconciliation'): ReadableStream<Uint8Array> {
  const out = new PassThrough();
  (async () => {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
    const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();
    for await (const rows of chunks) {
      for (const r of rows) {
        const row = sheet.addRow(EXPORT_COLUMNS.map((c) => c.value(r)));
        row.commit();
      }
    }
    sheet.commit();
    await workbook.commit();
  })().catch((err) => out.destroy(err));
  return Readable.toWeb(out) as unknown as WebReadableStream<Uint8Array> as unknown as ReadableStream<Uint8Array>;
}
