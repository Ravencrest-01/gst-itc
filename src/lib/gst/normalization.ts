import { createHash } from 'node:crypto';
import type { DocumentType } from '../reconciliation/types';

/**
 * Two levels of invoice-number normalisation (see docs/SPEC-CHANGES.md #2):
 *
 *  - canonical: uppercase, leading zeros of each numeric run stripped, separators removed. Never drops
 *    letters, so "INV123" and "123" stay distinct. Used in the Pass 1 exact key.
 *  - core: canonical with conventional prefixes (INV, INVOICE, BILL, TAX INVOICE) and
 *    financial-year tokens (FY24, 2024-25, 24-25 ...) removed. Used in Pass 2, where a
 *    core-number match is only accepted together with date and value checks.
 */

const SEP = String.raw`[\s/\\\-_.:#|]`;

/** Strips fiscal-year tokens at the start, e.g. "FY24/", "FY2024-25/", "2024-25/", "24-25-". */
const FY_PREFIX = new RegExp(String.raw`^(?:FY\s*(\d{2,4})(?:\s*-\s*(\d{2,4}))?|(\d{2,4})\s*-\s*(\d{2,4}))${SEP}+`);
/** Strips fiscal-year tokens at the end, e.g. "/24-25", "/2024-25", "-FY25". */
const FY_SUFFIX = new RegExp(String.raw`${SEP}+(?:FY\s*(\d{2,4})(?:\s*-\s*(\d{2,4}))?|(\d{2,4})\s*-\s*(\d{2,4}))$`);
/** Document-type words. Require a separator or a digit after them so "INVENTORY1" is not touched. */
const DOC_PREFIX = new RegExp(String.raw`^(?:TAX\s*INVOICE|INVOICE|INV|BILL)(?:${SEP}+|(?=\d))`);

function isYearToken(a: string | undefined, b: string | undefined, standalone: boolean): boolean {
  if (a === undefined) return false;
  const yy = (s: string) => Number(s.slice(-2));
  if (b === undefined) {
    // "FY24" alone is a year token; a bare "24" without an FY marker is not.
    return standalone;
  }
  return (yy(a) + 1) % 100 === yy(b);
}

function stripFyTokens(value: string): string {
  let out = value;
  const pre = FY_PREFIX.exec(out);
  if (pre && (isYearToken(pre[1], pre[2], true) || isYearToken(pre[3], pre[4], false))) {
    out = out.slice(pre[0].length);
  }
  const suf = FY_SUFFIX.exec(out);
  if (suf && (isYearToken(suf[1], suf[2], true) || isYearToken(suf[3], suf[4], false))) {
    out = out.slice(0, suf.index);
  }
  return out;
}

function toCanonical(value: string): string {
  // Strip leading zeros of every numeric run ("INV-000452" -> "INV452", "000452" -> "452"),
  // keeping a single "0" for all-zero runs, then drop separators.
  return value.replace(/(^|[^0-9])0+(?=[0-9])/g, '$1').replace(/[^A-Z0-9]/g, '');
}

export function canonicalInvoiceNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  return toCanonical(raw.toUpperCase().trim());
}

export function coreInvoiceNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  let value = raw.toUpperCase().trim();
  // Prefixes can be stacked: "INV/FY24/00452", "FY24-25/BILL-12".
  for (let i = 0; i < 3; i++) {
    const before = value;
    value = value.replace(DOC_PREFIX, '');
    value = stripFyTokens(value);
    if (value === before) break;
  }
  const core = toCanonical(value);
  // Never let stripping erase the identifier entirely.
  return core || canonicalInvoiceNumber(raw);
}

/**
 * Exact-match key. Amounts are intentionally NOT part of the key: two records with the
 * same reference must meet in Pass 1 so a value difference is reported as VALUE_MISMATCH
 * instead of silently falling through, and the ₹1 tolerance is applied after the lookup.
 */
export function normalizationHash(
  gstin: string,
  documentType: DocumentType,
  canonicalNo: string,
  financialYear: string,
): string {
  return createHash('sha256')
    .update(`${gstin}|${documentType}|${canonicalNo}|${financialYear}`)
    .digest('hex');
}

/** Rupees -> integer paise, avoiding float drift in comparisons. */
export function toPaise(rupees: number | string | null | undefined): number {
  if (rupees === null || rupees === undefined || rupees === '') return 0;
  const n = typeof rupees === 'number' ? rupees : Number(String(rupees).replace(/[,₹\s]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: "${rupees}"`);
  return Math.round(n * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}
