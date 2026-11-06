import { financialYearOf } from '../gst/fiscal';
import { validateGstin } from '../gst/gstin';
import {
  canonicalInvoiceNumber,
  coreInvoiceNumber,
  normalizationHash,
} from '../gst/normalization';
import type { DocumentType } from '../reconciliation/types';
import type {
  ColumnMapping,
  FieldKey,
  IngestionIssue,
  IngestionSource,
  NormalizedRow,
  RawRecord,
} from './types';
import {
  parseAmount,
  parseDate,
  parseDocumentType,
  parseReturnPeriod,
  parseYesNo,
  ValueError,
} from './values';

export type MapRowResult =
  | { ok: true; row: NormalizedRow; warnings: IngestionIssue[] }
  | { ok: false; errors: IngestionIssue[] }
  | { ok: 'skip' };

const AMOUNT_FIELDS = ['taxableValue', 'igst', 'cgst', 'sgst', 'cess'] as const;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Validates and normalizes one source row. Rows that are entirely empty, or look like a
 * totals line (no GSTIN and no invoice number), are skipped rather than reported.
 */
export function mapRow(
  record: RawRecord,
  mapping: ColumnMapping,
  source: IngestionSource,
): MapRowResult {
  const get = (f: FieldKey) => (mapping[f] ? record.values[mapping[f]!] : undefined);
  const row = record.rowNumber;
  const errors: IngestionIssue[] = [];
  const warnings: IngestionIssue[] = [];

  if (isBlank(get('supplierGstin')) && isBlank(get('invoiceNumber'))) return { ok: 'skip' };

  const attempt = <T>(field: FieldKey, fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (err) {
      if (!(err instanceof ValueError)) throw err;
      errors.push({ row, field, message: err.message });
      return undefined;
    }
  };

  // GSTIN: a malformed GSTIN can never match, so reject; a bad check digit is kept but flagged.
  const gst = validateGstin(String(get('supplierGstin') ?? ''));
  if (gst.reason === 'EMPTY') errors.push({ row, field: 'supplierGstin', message: 'GSTIN is empty' });
  else if (gst.reason === 'FORMAT') {
    errors.push({ row, field: 'supplierGstin', message: `Malformed GSTIN "${gst.gstin}"` });
  } else if (gst.reason === 'CHECKSUM') {
    warnings.push({ row, field: 'supplierGstin', message: `GSTIN "${gst.gstin}" fails the check digit; verify with vendor` });
  }

  const rawNo = String(get('invoiceNumber') ?? '').trim();
  const canonical = canonicalInvoiceNumber(rawNo);
  if (!canonical) errors.push({ row, field: 'invoiceNumber', message: 'Invoice number is empty' });
  if (rawNo.length > 100) errors.push({ row, field: 'invoiceNumber', message: 'Invoice number longer than 100 characters' });

  const invoiceDate = attempt('invoiceDate', () => parseDate(get('invoiceDate')));

  const amounts = {} as Record<(typeof AMOUNT_FIELDS)[number], number>;
  for (const f of AMOUNT_FIELDS) {
    amounts[f] = attempt(f, () => parseAmount(get(f), { required: f === 'taxableValue' })) ?? 0;
  }

  let documentType: DocumentType | undefined = parseDocumentType(get('documentType'));
  // Ledgers often book credit notes as negative amounts with no type column.
  const signs = AMOUNT_FIELDS.map((f) => Math.sign(amounts[f])).filter((s) => s !== 0);
  const allNegative = signs.length > 0 && signs.every((s) => s < 0);
  const mixedSigns = signs.some((s) => s < 0) && signs.some((s) => s > 0);
  if (mixedSigns) errors.push({ row, message: 'Amounts mix positive and negative values' });
  if (allNegative) {
    if (!documentType) documentType = 'CREDIT_NOTE';
    else if (documentType === 'INVOICE') {
      warnings.push({ row, field: 'documentType', message: 'Negative amounts on an invoice; treated as credit note' });
      documentType = 'CREDIT_NOTE';
    }
  }
  for (const f of AMOUNT_FIELDS) amounts[f] = Math.abs(amounts[f]);
  documentType ??= 'INVOICE';

  if (amounts.igst > 0 && amounts.cgst + amounts.sgst > 0) {
    warnings.push({ row, message: 'Both IGST and CGST/SGST are present on one document' });
  }

  let returnPeriod: string | null = null;
  if (source === 'GSTR2B') {
    const rp = get('returnPeriod');
    if (!isBlank(rp)) returnPeriod = attempt('returnPeriod', () => parseReturnPeriod(rp)) ?? null;
    else if (invoiceDate) returnPeriod = `${invoiceDate.slice(5, 7)}-${invoiceDate.slice(0, 4)}`;
  }

  const itcAvailable = attempt('itcAvailable', () => parseYesNo(get('itcAvailable'), true)) ?? true;
  const reverseCharge = attempt('reverseCharge', () => parseYesNo(get('reverseCharge'), false)) ?? false;

  if (errors.length || !invoiceDate) return { ok: false, errors };

  const financialYear = financialYearOf(invoiceDate);
  let supersedesHash: string | null = null;
  const originalNo = String(get('originalInvoiceNumber') ?? '').trim();
  if (originalNo) {
    const originalDate = get('originalInvoiceDate');
    let originalFy = financialYear;
    if (!isBlank(originalDate)) {
      try {
        originalFy = financialYearOf(parseDate(originalDate));
      } catch {
        warnings.push({ row, field: 'originalInvoiceDate', message: 'Unreadable original invoice date; assumed same FY' });
      }
    }
    const originalHash = normalizationHash(gst.gstin, documentType, canonicalInvoiceNumber(originalNo), originalFy);
    const hash = normalizationHash(gst.gstin, documentType, canonical, financialYear);
    if (originalHash !== hash) supersedesHash = originalHash;
  }

  const supplierName = String(get('supplierName') ?? '').trim() || null;
  return {
    ok: true,
    warnings,
    row: {
      rowNumber: row,
      supplierGstin: gst.gstin,
      supplierName: supplierName ? supplierName.slice(0, 255) : null,
      documentType,
      rawInvoiceNumber: rawNo,
      normalizedInvoiceNumber: canonical,
      coreInvoiceNumber: coreInvoiceNumber(rawNo),
      invoiceDate,
      financialYear,
      taxableValue: amounts.taxableValue,
      igst: amounts.igst,
      cgst: amounts.cgst,
      sgst: amounts.sgst,
      cess: amounts.cess,
      normalizationHash: normalizationHash(gst.gstin, documentType, canonical, financialYear),
      returnPeriod,
      itcAvailable,
      reverseCharge,
      isAmendment: Boolean(originalNo),
      supersedesHash,
    },
  };
}
