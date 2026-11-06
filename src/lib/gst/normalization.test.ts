import { describe, expect, it } from 'vitest';
import { financialYearOf, section164Deadline, toEpochDay } from './fiscal';
import { gstinCheckDigit, normalizeGstin, panFromGstin, validateGstin } from './gstin';
import {
  canonicalInvoiceNumber,
  coreInvoiceNumber,
  normalizationHash,
  toPaise,
} from './normalization';

describe('canonicalInvoiceNumber', () => {
  it.each([
    ['000452', '452'],
    [' inv/ 452 ', 'INV452'],
    ['INV-000452', 'INV452'], // letters kept; leading zeros of each numeric run go
    ['A1/0012', 'A112'],
    ['100-200', '100200'], // inner zeros untouched
    ['a_b-c.d#1', 'ABCD1'],
    ['0', '0'],
    ['000', '0'],
    ['', ''],
  ])('%s -> %s', (raw, expected) => {
    expect(canonicalInvoiceNumber(raw)).toBe(expected);
  });

  it('keeps INV123 and 123 distinct (no false exact matches)', () => {
    expect(canonicalInvoiceNumber('INV123')).not.toBe(canonicalInvoiceNumber('123'));
  });

  it('handles null/undefined', () => {
    expect(canonicalInvoiceNumber(null)).toBe('');
    expect(canonicalInvoiceNumber(undefined)).toBe('');
  });
});

describe('coreInvoiceNumber', () => {
  it.each([
    ['INV/000452', '452'],
    ['INV-452', '452'],
    ['inv452', '452'],
    ['INVOICE 452', '452'],
    ['TAX INVOICE 77', '77'],
    ['BILL-12', '12'],
    ['FY24/0012', '12'],
    ['FY2024-25/12', '12'],
    ['FY 24-25/12', '12'],
    ['2024-25/12', '12'],
    ['24-25/0012', '12'],
    ['12/24-25', '12'],
    ['12/2024-25', '12'],
    ['INV/24-25/0012', '12'],
    ['FY24-25/BILL-12', '12'],
    ['A/0012', 'A12'],
    ['CD-9902', 'CD9902'],
  ])('%s -> %s', (raw, expected) => {
    expect(coreInvoiceNumber(raw)).toBe(expected);
  });

  it.each([
    ['INVENTORY1', 'INVENTORY1'], // word that merely starts with INV
    ['12-34/5', '12345'], // 12-34 is not a consecutive year pair
    ['FY24', 'FY24'], // nothing left after stripping -> fall back
    ['INV', 'INV'],
    ['BILLING-7', 'BILLING7'],
  ])('does not over-strip %s', (raw, expected) => {
    expect(coreInvoiceNumber(raw)).toBe(expected);
  });
});

describe('normalizationHash', () => {
  const g = '27AAPFU0939F1ZV';
  it('is deterministic and hex', () => {
    const h = normalizationHash(g, 'INVOICE', '452', '2025-2026');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizationHash(g, 'INVOICE', '452', '2025-2026')).toBe(h);
  });
  it('separates document type and financial year', () => {
    const base = normalizationHash(g, 'INVOICE', '452', '2025-2026');
    expect(normalizationHash(g, 'CREDIT_NOTE', '452', '2025-2026')).not.toBe(base);
    expect(normalizationHash(g, 'INVOICE', '452', '2024-2025')).not.toBe(base);
  });
});

describe('toPaise', () => {
  it('parses Indian-format strings and avoids float drift', () => {
    expect(toPaise('1,23,456.78')).toBe(12_345_678);
    expect(toPaise('₹ 500')).toBe(50_000);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(null)).toBe(0);
    expect(toPaise('')).toBe(0);
  });
  it('rejects garbage', () => {
    expect(() => toPaise('abc')).toThrow();
  });
});

describe('GSTIN', () => {
  it('accepts a valid GSTIN', () => {
    expect(validateGstin('27AAPFU0939F1ZV')).toEqual({ gstin: '27AAPFU0939F1ZV', valid: true });
  });
  it('normalizes whitespace and case', () => {
    expect(normalizeGstin(' 27aapfu 0939f1zv ')).toBe('27AAPFU0939F1ZV');
    expect(validateGstin(' 27aapfu0939f1zv').valid).toBe(true);
  });
  it('rejects a wrong check digit', () => {
    expect(validateGstin('27AAPFU0939F1ZA')).toMatchObject({ valid: false, reason: 'CHECKSUM' });
  });
  it('rejects bad format and empty input', () => {
    expect(validateGstin('27AAPFU0939F1XV').reason).toBe('FORMAT');
    expect(validateGstin('').reason).toBe('EMPTY');
  });
  it('extracts PAN', () => {
    expect(panFromGstin('27AAPFU0939F1ZV')).toBe('AAPFU0939F');
  });
  it('check digit round-trips', () => {
    const first14 = '29AAPFU0939F1Z';
    expect(validateGstin(first14 + gstinCheckDigit(first14)).valid).toBe(true);
  });
});

describe('fiscal', () => {
  it('derives the financial year', () => {
    expect(financialYearOf('2025-03-31')).toBe('2024-2025');
    expect(financialYearOf('2025-04-01')).toBe('2025-2026');
  });
  it('computes the Section 16(4) deadline', () => {
    expect(section164Deadline('2025-2026')).toBe('2026-11-30');
    expect(section164Deadline('2025-2026', '2026-10-15')).toBe('2026-10-15');
    expect(section164Deadline('2025-2026', '2026-12-20')).toBe('2026-11-30');
  });
  it('rejects invalid dates and FY strings', () => {
    expect(() => toEpochDay('2025-02-30')).toThrow();
    expect(() => toEpochDay('30/04/2025')).toThrow();
    expect(() => section164Deadline('2025-2027')).toThrow();
  });
});
