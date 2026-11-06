import { describe, expect, it } from 'vitest';
import { autoMapColumns, normalizeHeader } from './fields';
import {
  parseAmount,
  parseDate,
  parseDocumentType,
  parseReturnPeriod,
  parseYesNo,
  plainCellValue,
} from './values';

describe('parseDate', () => {
  it.each([
    ['2025-08-10', '2025-08-10'],
    ['10-08-2025', '2025-08-10'],
    ['10/08/2025', '2025-08-10'],
    ['10.08.2025', '2025-08-10'],
    ['1/8/25', '2025-08-01'],
    ['10-Aug-2025', '2025-08-10'],
    ['10 August 2025', '2025-08-10'],
    ["10-Aug'25", '2025-08-10'],
    ['2025-08-10T00:00:00.000Z', '2025-08-10'],
    ['45879', '2025-08-10'],
  ])('%s -> %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it('reads Excel serials and UTC Date objects', () => {
    expect(parseDate(45879)).toBe('2025-08-10');
    expect(parseDate(new Date(Date.UTC(2025, 7, 10)))).toBe('2025-08-10');
  });

  it.each(['', '31-02-2025', '2025/13/01', 'yesterday', 'Foo-2025'])('rejects %j', (input) => {
    expect(() => parseDate(input)).toThrow();
  });
});

describe('parseAmount', () => {
  it.each<[unknown, number]>([
    ['1,23,456.78', 123456.78],
    ['₹ 500', 500],
    ['Rs. 1,000', 1000],
    ['(1,200.00)', -1200],
    ['1200 Cr', -1200],
    ['1200 Dr', 1200],
    ['-45.5', -45.5],
    ['-', 0],
    ['', 0],
    [null, 0],
    [180.0900000001, 180.09],
  ])('%j -> %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('rejects text and requires a value when asked', () => {
    expect(() => parseAmount('twelve')).toThrow();
    expect(() => parseAmount('', { required: true })).toThrow();
  });
});

describe('parseDocumentType', () => {
  it.each([
    ['R', 'INVOICE'],
    ['Regular', 'INVOICE'],
    ['Tax Invoice', 'INVOICE'],
    ['SEZWP', 'INVOICE'],
    ['DE', 'INVOICE'],
    ['C', 'CREDIT_NOTE'],
    ['Credit Note', 'CREDIT_NOTE'],
    ['CN', 'CREDIT_NOTE'],
    ['D', 'DEBIT_NOTE'],
    ['Debit note', 'DEBIT_NOTE'],
  ])('%s -> %s', (input, expected) => {
    expect(parseDocumentType(input)).toBe(expected);
  });
  it('returns undefined for blanks', () => {
    expect(parseDocumentType('')).toBeUndefined();
  });
});

describe('parseYesNo / parseReturnPeriod / plainCellValue', () => {
  it('parses flags', () => {
    expect(parseYesNo('Y', false)).toBe(true);
    expect(parseYesNo('No', true)).toBe(false);
    expect(parseYesNo('', true)).toBe(true);
    expect(() => parseYesNo('maybe', true)).toThrow();
  });

  it.each([
    ['082025', '08-2025'],
    ['8-2025', '08-2025'],
    ['08/2025', '08-2025'],
    ['2025-08', '08-2025'],
    ['Aug-2025', '08-2025'],
    ["Aug'25", '08-2025'],
    ['August 2025', '08-2025'],
  ])('return period %s -> %s', (input, expected) => {
    expect(parseReturnPeriod(input)).toBe(expected);
  });

  it('flattens ExcelJS cell objects', () => {
    expect(plainCellValue({ richText: [{ text: 'INV' }, { text: '-1' }] })).toBe('INV-1');
    expect(plainCellValue({ formula: 'A1*2', result: 42 })).toBe(42);
    expect(plainCellValue({ text: 'link', hyperlink: 'x' })).toBe('link');
    expect(plainCellValue({ error: '#REF!' })).toBeNull();
  });
});

describe('column mapping', () => {
  it('normalizes currency-suffixed headers without eating real words', () => {
    expect(normalizeHeader('Integrated Tax(₹)')).toBe('integratedtax');
    expect(normalizeHeader('Taxable Value Rs.')).toBe('taxablevalue');
    expect(normalizeHeader('Cess (INR)')).toBe('cess');
    expect(normalizeHeader('Particulars')).toBe('particulars');
  });

  it('maps a Tally-style purchase register', () => {
    const { mapping, missingRequired } = autoMapColumns(
      ['Date', 'Particulars', 'Voucher No.', 'Supplier Invoice No.', 'GSTIN/UIN', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess'],
      'PURCHASE_REGISTER',
    );
    expect(missingRequired).toEqual([]);
    expect(mapping).toMatchObject({
      invoiceDate: 'Date',
      supplierName: 'Particulars',
      invoiceNumber: 'Supplier Invoice No.',
      supplierGstin: 'GSTIN/UIN',
      taxableValue: 'Taxable Value',
    });
  });

  it('maps GSTR-2B portal headers', () => {
    const { mapping, missingRequired } = autoMapColumns(
      [
        'GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type', 'Invoice Date',
        'Invoice Value(₹)', 'Place of supply', 'Supply Attract Reverse Charge', 'Taxable Value (₹)',
        'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)', 'GSTR-1/IFF/GSTR-5 Period',
        'ITC Availability',
      ],
      'GSTR2B',
    );
    expect(missingRequired).toEqual([]);
    expect(mapping).toMatchObject({
      sgst: 'State/UT Tax(₹)',
      returnPeriod: 'GSTR-1/IFF/GSTR-5 Period',
      reverseCharge: 'Supply Attract Reverse Charge',
      documentType: 'Invoice type',
    });
    expect(Object.values(mapping)).not.toContain('Invoice Value(₹)');
  });

  it('honours overrides and reports missing required fields', () => {
    const result = autoMapColumns(['Doc', 'Party GSTIN', 'Bill Date', 'Value'], 'PURCHASE_REGISTER', {
      invoiceNumber: 'Doc',
    });
    expect(result.mapping.invoiceNumber).toBe('Doc');
    expect(result.missingRequired).toEqual(['taxableValue']);
    expect(result.unmappedHeaders).toEqual(['Value']);
  });
});
