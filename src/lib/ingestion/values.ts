import { toEpochDay } from '../gst/fiscal';
import { toPaise } from '../gst/normalization';
import type { DocumentType } from '../reconciliation/types';

export class ValueError extends Error {}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

/** "AUG", "AUGUST", "SEPT" -> month number; any prefix of 3+ letters of the full name. */
function monthOf(word: string): number | undefined {
  if (word.length < 3) return undefined;
  const i = MONTHS.findIndex((m) => m.startsWith(word));
  return i >= 0 ? i + 1 : undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

function iso(y: number, m: number, d: number): string {
  const value = `${y}-${pad(m)}-${pad(d)}`;
  try {
    toEpochDay(value); // validates the calendar date
  } catch {
    throw new ValueError(`Invalid date`);
  }
  return value;
}

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

const EXCEL_EPOCH_DAY = Date.UTC(1899, 11, 30) / 86_400_000;

/**
 * Accepts Date objects, Excel serial numbers and the common Indian text formats.
 * Ambiguous numeric dates are read day-first (dd/mm/yyyy), as Indian ledgers are.
 */
export function parseDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new ValueError('Invalid date');
    // Spreadsheet dates have no timezone; ExcelJS returns them as UTC midnight.
    return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number') {
    if (value < 1 || value > 2_958_465) throw new ValueError('Invalid date');
    const d = new Date((EXCEL_EPOCH_DAY + Math.floor(value)) * 86_400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) throw new ValueError('Date is empty');

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) return iso(expandYear(+m[3]), +m[2], +m[1]);
  m = /^(\d{1,2})[-/.\s]([A-Z]{3,9})[-/.\s,']*(\d{2}|\d{4})$/.exec(s);
  if (m && monthOf(m[2])) return iso(expandYear(+m[3]), monthOf(m[2])!, +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(Number(s));
  throw new ValueError(`Unrecognised date "${String(value)}"`);
}

/**
 * Returns signed rupees rounded to paise. Accepts "1,23,456.78", "₹ 500", "(1,200.00)",
 * "1200 Cr"/"1200 Dr" (Dr positive, Cr negative) and ExcelJS formula results.
 */
export function parseAmount(value: unknown, { required = false } = {}): number {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw new ValueError('Amount is empty');
    return 0;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValueError('Invalid amount');
    return toPaise(value) / 100;
  }
  let s = String(value).trim().toUpperCase();
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  const drCr = /\s*(DR|CR)\.?$/.exec(s);
  if (drCr) {
    if (drCr[1] === 'CR') sign *= -1;
    s = s.slice(0, drCr.index);
  }
  s = s.replace(/[₹,\s]|RS\.?|INR/g, '');
  if (s === '-' || s === '') return 0;
  if (!/^[-+]?\d*\.?\d+$/.test(s)) throw new ValueError(`Invalid amount "${String(value)}"`);
  return (sign * toPaise(s)) / 100;
}

export function parseDocumentType(value: unknown): DocumentType | undefined {
  const s = String(value ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return undefined;
  if (s === 'C' || s === 'CN' || s.includes('CREDIT')) return 'CREDIT_NOTE';
  if (s === 'D' || s === 'DN' || s.includes('DEBIT')) return 'DEBIT_NOTE';
  // R, Regular, Tax Invoice, B2B, SEZ supplies, Deemed export, Purchase, ...
  return 'INVOICE';
}

export function parseYesNo(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return fallback;
  if (['Y', 'YES', 'TRUE', '1', 'ELIGIBLE', 'AVAILABLE'].includes(s)) return true;
  if (['N', 'NO', 'FALSE', '0', 'INELIGIBLE', 'NOTAVAILABLE', 'NOT AVAILABLE', 'TEMPORARY'].includes(s)) {
    return false;
  }
  throw new ValueError(`Expected Y/N, got "${String(value)}"`);
}

/**
 * Normalizes a return period to MM-YYYY. Accepts "082025", "08-2025", "08/2025",
 * "2025-08", "Aug-2025", "Aug'25", "August 2025".
 */
export function parseReturnPeriod(value: unknown): string {
  if (value instanceof Date) return `${pad(value.getUTCMonth() + 1)}-${value.getUTCFullYear()}`;
  const s = String(value ?? '').trim().toUpperCase();
  let m = /^(\d{1,2})[-/.]?(\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${pad(+m[1])}-${m[2]}`;
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${pad(+m[2])}-${m[1]}`;
  m = /^([A-Z]{3,9})[-/.\s']*(\d{2}|\d{4})$/.exec(s);
  if (m && monthOf(m[1])) return `${pad(monthOf(m[1])!)}-${expandYear(+m[2])}`;
  throw new ValueError(`Unrecognised return period "${String(value)}"`);
}

/** ExcelJS cells can be rich text, formulas, hyperlinks or errors; reduce them to plain values. */
export function plainCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || value instanceof Date) return value;
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.richText)) return (v.richText as { text: string }[]).map((r) => r.text).join('');
  if ('result' in v) return plainCellValue(v.result);
  if ('text' in v) return v.text;
  if ('error' in v) return null;
  return String(value);
}
