import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { gstinCheckDigit } from '../gst/gstin';
import { previewFile } from './preview';

const gstin = (state: string, pan: string) => {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
};
const ACME = gstin('27', 'AAACB9812R');

const CSV = [
  'Demo Manufacturing Pvt Ltd',
  'Purchase Register',
  '',
  'Date,Particulars,Doc,GSTIN/UIN,Taxable Value,IGST',
  `10-08-2025,Acme,A-1,${ACME},1000,180`,
  `11-08-2025,Acme,A-2,${ACME},2000,360`,
  `31-02-2025,Acme,A-3,${ACME},3000,540`,
  ...Array.from({ length: 10 }, (_, i) => `12-08-2025,Acme,B-${i},${ACME},100,18`),
].join('\n');

describe('previewFile', () => {
  it('detects the header, samples rows, counts everything and maps columns', async () => {
    const p = await previewFile('pr.csv', CSV, 'PURCHASE_REGISTER');
    expect(p.format).toBe('csv');
    const [sheet] = p.sheets;
    expect(sheet.headers).toEqual(['Date', 'Particulars', 'Doc', 'GSTIN/UIN', 'Taxable Value', 'IGST']);
    expect(sheet.rowCount).toBe(13);
    expect(sheet.sampleRows).toHaveLength(5);
    expect(sheet.sampleRows[0]).toMatchObject({ Doc: 'A-1', IGST: '180' });
    // "Doc" is not a known name for the invoice number, so it must be mapped by hand.
    expect(sheet.missingRequired).toEqual(['invoiceNumber']);
    expect(sheet.unmappedHeaders).toEqual(['Doc']);
    // "Invoice number is empty" would only repeat the missing mapping; the bad date is real.
    expect(sheet.sampleIssues).toEqual([{ row: 7, field: 'invoiceDate', message: 'Invalid date' }]);
  });

  it('re-checks the sample rows under a user override', async () => {
    const p = await previewFile('pr.csv', CSV, 'PURCHASE_REGISTER', { invoiceNumber: 'Doc' });
    const [sheet] = p.sheets;
    expect(sheet.mapping.invoiceNumber).toBe('Doc');
    expect(sheet.missingRequired).toEqual([]);
    expect(sheet.sampleIssues).toEqual([{ row: 7, field: 'invoiceDate', message: 'Invalid date' }]);
  });

  it('previews each Excel sheet and reports skipped ones', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Read me').addRow(['GSTR-2B']);
    const b2b = wb.addWorksheet('B2B');
    b2b.addRow(['GSTIN of supplier', 'Invoice number', 'Invoice Date', 'Taxable Value (₹)', 'Integrated Tax(₹)']);
    b2b.addRow([ACME, 'INV-1', new Date(Date.UTC(2025, 7, 10)), 1000, 180]);
    wb.addWorksheet('B2BA').addRow(['x']);
    const p = await previewFile('2b.xlsx', Buffer.from(await wb.xlsx.writeBuffer()), 'GSTR2B');
    expect(p.sheets.map((s) => [s.name, s.rowCount, s.skippedReason ?? null])).toEqual([
      ['Read me', 0, 'no header row or data found'],
      ['B2B', 1, null],
      ['B2BA', 0, 'amendment sheet (use GSTR-2B JSON)'],
    ]);
    expect(p.sheets[1].sampleRows[0]['Invoice Date']).toBe('2025-08-10');
    expect(p.sheets[1].missingRequired).toEqual([]);
  });

  it('summarises GSTR-2B JSON by section without a mapping step', async () => {
    const json = {
      data: {
        gstin: '27AABCD1234E1Z5',
        rtnprd: '082025',
        docdata: {
          b2b: [{ ctin: ACME, trdnm: 'Acme', inv: [{ inum: 'I-1', dt: '10-08-2025', txval: 100, igst: 18 }] }],
          cdnr: [{ ctin: ACME, nt: [{ ntnum: 'C-1', dt: '11-08-2025', typ: 'C', txval: 10, igst: 1.8 }] }],
          impg: [],
        },
      },
    };
    const p = await previewFile('2b.json', JSON.stringify(json), 'GSTR2B');
    expect(p.gstr2b).toEqual({ gstin: '27AABCD1234E1Z5', returnPeriod: '082025' });
    expect(p.sheets.map((s) => [s.name, s.rowCount, s.skippedReason ?? null])).toEqual([
      ['b2b', 1, null],
      ['cdnr', 1, null],
      ['impg', 0, 'section not reconciled'],
    ]);
    expect(p.sheets[0].sampleIssues).toEqual([]);
  });

  it('rejects files it cannot read', async () => {
    await expect(previewFile('x.json', '{}', 'PURCHASE_REGISTER')).rejects.toThrow(/only supported for GSTR-2B/);
    await expect(previewFile('x.json', '{bad', 'GSTR2B')).rejects.toThrow(/not valid JSON/);
    await expect(previewFile('x.xls', '', 'GSTR2B')).rejects.toThrow(/Legacy \.xls/);
  });
});
