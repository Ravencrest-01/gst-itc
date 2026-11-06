import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { gstinCheckDigit } from '../gst/gstin';
import { ingestFile, ingestRecords } from './pipeline';
import type { IngestionSink, NormalizedRow } from './types';

const gstin = (state: string, pan: string) => {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
};
export const ACME = gstin('27', 'AAACB9812R');
export const ORION = gstin('33', 'AAACG1122R');

function memorySink() {
  const batches: NormalizedRow[][] = [];
  const sink: IngestionSink = {
    async write(rows) {
      batches.push([...rows]);
      return rows.length;
    },
  };
  return { sink, batches, rows: () => batches.flat() };
}

const PR_CSV = [
  '﻿Demo Manufacturing Pvt Ltd',
  'Purchase Register 1-Apr-2025 to 31-Mar-2026',
  '',
  'Date,Particulars,Supplier Invoice No.,GSTIN/UIN,Taxable Value,IGST,CGST,SGST',
  `10-08-2025,Acme Logistics,INV/0001,${ACME},"1,00,000.00","18,000.00",,`,
  `12/08/2025,Orion Traders,OR-12,${ORION.toLowerCase()},5000,,450,450`,
  `15-Aug-2025,Acme Logistics,CN-7,${ACME},(1000),(180),,`,
  `16-08-2025,Bad Vendor,X-1,27ABC,100,18,,`,
  `31-02-2025,Acme Logistics,INV/0002,${ACME},100,18,,`,
  `10-08-2025,Acme Logistics,INV-1,${ACME},100000,18000,,`,
  ',Total,,,106000,18000,450,450',
].join('\r\n');

describe('CSV ingestion', () => {
  it('finds the header under a title block and normalizes rows', async () => {
    const { sink, rows } = memorySink();
    const summary = await ingestFile('pr.csv', PR_CSV, { source: 'PURCHASE_REGISTER', sink });

    expect(summary).toMatchObject({ rowCount: 6, validCount: 4, writtenCount: 3, duplicateCount: 1, errorCount: 2 });
    const [acme, orion, cn] = rows();
    expect(acme).toMatchObject({
      rowNumber: 5,
      supplierGstin: ACME,
      supplierName: 'Acme Logistics',
      normalizedInvoiceNumber: 'INV1',
      invoiceDate: '2025-08-10',
      financialYear: '2025-2026',
      taxableValue: 100_000,
      igst: 18_000,
      documentType: 'INVOICE',
    });
    expect(orion).toMatchObject({ supplierGstin: ORION, cgst: 450, sgst: 450, invoiceDate: '2025-08-12' });
    expect(cn).toMatchObject({ documentType: 'CREDIT_NOTE', taxableValue: 1_000, igst: 180 });
  });

  it('reports row-level errors and duplicates with row numbers', async () => {
    const { sink } = memorySink();
    const summary = await ingestFile('pr.csv', PR_CSV, { source: 'PURCHASE_REGISTER', sink });
    expect(summary.errors).toEqual([
      { row: 8, field: 'supplierGstin', message: 'Malformed GSTIN "27ABC"' },
      { row: 9, field: 'invoiceDate', message: 'Invalid date' },
    ]);
    expect(summary.warnings).toContainEqual({ row: 10, message: 'Duplicate of row 5; skipped' });
  });

  it('writes in fixed-size batches', async () => {
    const lines = ['GSTIN,Invoice No,Invoice Date,Taxable Value,IGST'];
    for (let i = 1; i <= 25; i++) lines.push(`${ACME},A-${i},01-09-2025,100,18`);
    const { sink, batches } = memorySink();
    const summary = await ingestFile('pr.csv', lines.join('\n'), { source: 'PURCHASE_REGISTER', sink, batchSize: 10 });
    expect(batches.map((b) => b.length)).toEqual([10, 10, 5]);
    expect(summary.writtenCount).toBe(25);
  });

  it('uses user column overrides', async () => {
    const csv = `Doc,Party GSTIN,Bill Date,Value,Tax\n${ACME},${ACME},01-09-2025,100,18`.replace(`${ACME},${ACME}`, `Z-9,${ACME}`);
    const { sink, rows } = memorySink();
    await ingestFile('pr.csv', csv, {
      source: 'PURCHASE_REGISTER',
      sink,
      mapping: { invoiceNumber: 'Doc', taxableValue: 'Value', igst: 'Tax' },
    });
    expect(rows()[0]).toMatchObject({ rawInvoiceNumber: 'Z-9', taxableValue: 100, igst: 18 });
  });

  it('reports missing required columns instead of guessing', async () => {
    const { sink } = memorySink();
    const summary = await ingestFile('pr.csv', `GSTIN,Invoice No,Invoice Date,IGST\n${ACME},A-1,01-09-2025,18`, {
      source: 'PURCHASE_REGISTER',
      sink,
    });
    expect(summary.writtenCount).toBe(0);
    expect(summary.errors[0].message).toMatch(/Required column\(s\) not found: taxableValue/);
  });

  it('rejects files without a header row and unsupported formats', async () => {
    const { sink } = memorySink();
    await expect(ingestFile('x.csv', 'a,b\n1,2', { source: 'PURCHASE_REGISTER', sink })).rejects.toThrow(/No invoice rows/);
    await expect(ingestFile('x.xls', '', { source: 'PURCHASE_REGISTER', sink })).rejects.toThrow(/Legacy \.xls/);
    await expect(ingestFile('x.pdf', '', { source: 'PURCHASE_REGISTER', sink })).rejects.toThrow(/Unsupported/);
  });

  it('streams 50,000 rows with flat memory', async () => {
    const lines = ['GSTIN,Invoice No,Invoice Date,Taxable Value,IGST'];
    for (let i = 0; i < 50_000; i++) lines.push(`${ACME},A-${i},01-09-2025,100,18`);
    let written = 0;
    const t0 = performance.now();
    const summary = await ingestFile('big.csv', lines.join('\n'), {
      source: 'PURCHASE_REGISTER',
      sink: { write: async (r) => (written += r.length, r.length) },
    });
    expect(summary.writtenCount).toBe(50_000);
    expect(written).toBe(50_000);
    expect(performance.now() - t0).toBeLessThan(10_000);
  });
});

describe('XLSX ingestion', () => {
  async function gstr2bWorkbook(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const readme = wb.addWorksheet('Read me');
    readme.addRow(['Goods and Services Tax - GSTR-2B']);
    readme.addRow(['This sheet explains the other sheets']);

    const b2b = wb.addWorksheet('B2B');
    b2b.addRow(['Taxable inward supplies received from registered persons']);
    b2b.addRow([]);
    // Two-row header, as on the portal: group labels above, field labels below.
    b2b.addRow(['GSTIN of supplier', 'Trade/Legal name', 'Invoice details', '', '', '', 'Taxable Value (₹)', 'Tax Amount', '', '', '', 'GSTR-1/IFF/GSTR-5 Period', 'ITC Availability']);
    b2b.addRow(['', '', 'Invoice number', 'Invoice type', 'Invoice Date', 'Invoice Value(₹)', '', 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)', '', '']);
    b2b.addRow([ACME, 'Acme Logistics', 'INV-1', 'Regular', '10-08-2025', 118_000, 100_000, 18_000, 0, 0, 0, "Aug'25", 'Yes']);
    b2b.addRow([ORION, 'Orion Traders', { richText: [{ text: 'OR-' }, { text: '12' }] }, 'Regular', new Date(Date.UTC(2025, 7, 12)), 5_900, 5_000, 0, 450, 450, 0, 'Aug-2025', 'No']);
    b2b.addRow([ACME, 'Acme Logistics', 'INV-2', 'Regular', '20-08-2025', 1_180, { formula: '1180/1.18', result: 1000 }, 180, 0, 0, 0, '082025', 'Y']);

    const cdnr = wb.addWorksheet('B2B-CDNR');
    cdnr.addRow(['GSTIN of supplier', 'Trade/Legal name', 'Note number', 'Note type', 'Note date', 'Taxable Value (₹)', 'Integrated Tax(₹)']);
    cdnr.addRow([ACME, 'Acme Logistics', 'CN-7', 'Credit note', '25-08-2025', 1_000, 180]);

    // Portal layout: original and revised invoice details side by side.
    const b2ba = wb.addWorksheet('B2BA');
    b2ba.addRow(['Original details', '', 'GSTIN of supplier', 'Revised details', '', 'Taxable Value (₹)', 'Integrated Tax(₹)']);
    b2ba.addRow(['Invoice number', 'Invoice Date', '', 'Invoice number', 'Invoice Date', '', '']);
    b2ba.addRow(['INV-9', '01-08-2025', ACME, 'INV-9A', '01-08-2025', 1, 0.18]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('streams every sheet, merges two-row headers, and skips amendment sheets', async () => {
    const { sink, rows } = memorySink();
    const summary = await ingestFile('2b.xlsx', await gstr2bWorkbook(), { source: 'GSTR2B', sink });

    expect(summary).toMatchObject({ rowCount: 4, writtenCount: 4, errorCount: 0 });
    expect(summary.skippedSheets.sort()).toEqual(['B2BA', 'Read me']);
    expect(summary.warnings.map((w) => w.message).join('\n')).toMatch(/amendment sheet/);
    const [inv1, orion, inv2, cn] = rows();
    expect(inv1).toMatchObject({
      sheet: 'B2B',
      rowNumber: 5,
      rawInvoiceNumber: 'INV-1',
      taxableValue: 100_000,
      igst: 18_000,
      returnPeriod: '08-2025',
      itcAvailable: true,
    });
    expect(orion).toMatchObject({ rawInvoiceNumber: 'OR-12', invoiceDate: '2025-08-12', itcAvailable: false });
    expect(inv2.taxableValue).toBe(1_000);
    expect(cn).toMatchObject({ sheet: 'B2B-CDNR', documentType: 'CREDIT_NOTE', returnPeriod: '08-2025' });
  });

  it('reads every sheet of an ExcelJS-written workbook, every time', async () => {
    // Regression: the streaming reader returned only the first sheet for most parses.
    const book = await gstr2bWorkbook();
    for (let i = 0; i < 20; i++) {
      const { sink, rows } = memorySink();
      await ingestFile('2b.xlsx', book, { source: 'GSTR2B', sink });
      expect(rows().map((r) => r.sheet)).toEqual(['B2B', 'B2B', 'B2B', 'B2B-CDNR']);
    }
  });

  it('flags ambiguous amendment-style sheets even under another name', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Amended invoices');
    ws.addRow(['Invoice number', 'Invoice Date', 'GSTIN of supplier', 'Invoice number', 'Invoice Date', 'Taxable Value (₹)']);
    ws.addRow(['INV-9', '01-08-2025', ACME, 'INV-9A', '01-08-2025', 1]);
    const { sink } = memorySink();
    await expect(ingestFile('a.xlsx', Buffer.from(await wb.xlsx.writeBuffer()), { source: 'GSTR2B', sink })).rejects.toThrow(
      /No invoice rows found\. .*Skipped Amended invoices: several columns match invoiceNumber/,
    );
  });

  it('rejects oversized and corrupt workbooks with a clear message', async () => {
    const { sink } = memorySink();
    await expect(ingestFile('big.xlsx', Buffer.alloc(21 * 1024 * 1024), { source: 'GSTR2B', sink })).rejects.toThrow(/larger than 20 MB; export it as CSV/);
    await expect(ingestFile('bad.xlsx', 'not a zip', { source: 'GSTR2B', sink })).rejects.toThrow(/Not a readable \.xlsx/);
  });
});

describe('GSTR-2B JSON ingestion', () => {
  const json = {
    data: {
      gstin: '27AABCD1234E1Z5',
      rtnprd: '082025',
      docdata: {
        b2b: [
          {
            ctin: ACME,
            trdnm: 'Acme Logistics',
            inv: [
              { inum: 'INV-1', dt: '10-08-2025', typ: 'R', itcavl: 'Y', rev: 'N', items: [{ txval: 60_000, igst: 10_800 }, { txval: 40_000, igst: 7_200 }] },
              { inum: 'INV-5', dt: '11-08-2025', typ: 'R', txval: 1_000, igst: 180 },
            ],
          },
        ],
        b2ba: [
          { ctin: ACME, trdnm: 'Acme Logistics', inv: [{ oinum: 'INV-5', oidt: '11-08-2025', inum: 'INV-5A', dt: '11-08-2025', txval: 1_100, igst: 198 }] },
        ],
        cdnr: [{ ctin: ORION, trdnm: 'Orion', nt: [{ ntnum: 'CN-1', dt: '20-08-2025', typ: 'C', txval: 500, cgst: 45, sgst: 45 }] }],
        isd: [{ ctin: ORION, doclist: [] }],
      },
    },
  };

  it('flattens sections, sums items, and links amendments to originals', async () => {
    const { sink, rows } = memorySink();
    const summary = await ingestFile('2b.json', JSON.stringify(json), { source: 'GSTR2B', sink });
    expect(summary).toMatchObject({ rowCount: 4, writtenCount: 4, errorCount: 0, skippedSheets: ['isd'] });

    const byNo = Object.fromEntries(rows().map((r) => [r.rawInvoiceNumber, r]));
    expect(byNo['INV-1']).toMatchObject({ taxableValue: 100_000, igst: 18_000, returnPeriod: '08-2025', isAmendment: false });
    expect(byNo['INV-5A']).toMatchObject({ isAmendment: true, supersedesHash: byNo['INV-5'].normalizationHash });
    expect(byNo['CN-1']).toMatchObject({ documentType: 'CREDIT_NOTE', cgst: 45, sgst: 45 });
  });

  it('rejects non-2B JSON and JSON for the purchase register', async () => {
    const { sink } = memorySink();
    await expect(ingestFile('x.json', '{"foo":1}', { source: 'GSTR2B', sink })).rejects.toThrow(/docdata/);
    await expect(ingestFile('x.json', '{oops', { source: 'GSTR2B', sink })).rejects.toThrow(/valid JSON/);
    await expect(ingestFile('x.json', '{}', { source: 'PURCHASE_REGISTER', sink })).rejects.toThrow(/only supported for GSTR-2B/);
  });
});

describe('ingestRecords de-duplication (GSTR-2B)', () => {
  it('keeps the later row within a batch', async () => {
    const values = (igst: number) => ({ GSTIN: ACME, 'Invoice No': 'A-1', 'Invoice Date': '01-09-2025', 'Taxable Value': 100, IGST: igst });
    const { sink, rows } = memorySink();
    const summary = await ingestRecords(
      [
        { rowNumber: 2, values: values(18) },
        { rowNumber: 3, values: values(20) },
      ],
      { source: 'GSTR2B', sink },
    );
    expect(rows()).toHaveLength(1);
    expect(rows()[0].igst).toBe(20);
    expect(summary.warnings[0].message).toBe('Duplicate of row 2; later row kept');
  });
});
