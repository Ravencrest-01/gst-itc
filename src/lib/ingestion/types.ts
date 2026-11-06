import type { DocumentType } from '../reconciliation/types';

export type IngestionSource = 'PURCHASE_REGISTER' | 'GSTR2B';

/** Standard internal fields that uploaded columns map onto. */
export type FieldKey =
  | 'supplierGstin'
  | 'supplierName'
  | 'invoiceNumber'
  | 'invoiceDate'
  | 'documentType'
  | 'taxableValue'
  | 'igst'
  | 'cgst'
  | 'sgst'
  | 'cess'
  | 'returnPeriod'
  | 'itcAvailable'
  | 'reverseCharge'
  | 'originalInvoiceNumber'
  | 'originalInvoiceDate';

/** Field -> source column header. */
export type ColumnMapping = Partial<Record<FieldKey, string>>;

/** One source row keyed by its column header. `rowNumber` is 1-based, as the user sees it. */
export interface RawRecord {
  rowNumber: number;
  /** Worksheet or JSON section the row came from. */
  sheet?: string;
  values: Record<string, unknown>;
}

export interface IngestionIssue {
  row: number;
  sheet?: string;
  field?: FieldKey;
  message: string;
}

/** A validated, normalized row ready for persistence. Amounts are positive rupees. */
export interface NormalizedRow {
  rowNumber: number;
  sheet?: string;
  supplierGstin: string;
  supplierName: string | null;
  documentType: DocumentType;
  rawInvoiceNumber: string;
  normalizedInvoiceNumber: string;
  coreInvoiceNumber: string;
  invoiceDate: string;
  financialYear: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  normalizationHash: string;
  /** MM-YYYY (GSTR-2B only) */
  returnPeriod: string | null;
  itcAvailable: boolean;
  reverseCharge: boolean;
  isAmendment: boolean;
  /** Hash of the original document an amendment replaces. */
  supersedesHash: string | null;
}

export interface IngestionSink {
  /** Persists one batch; returns the number of rows written. */
  write(rows: NormalizedRow[]): Promise<number>;
}

export interface IngestionSummary {
  source: IngestionSource;
  /** Mapping used per sheet ("" for CSV). */
  mappings: Record<string, ColumnMapping>;
  /** Sheets ignored because no header row or required column was found. */
  skippedSheets: string[];
  rowCount: number;
  validCount: number;
  writtenCount: number;
  duplicateCount: number;
  errorCount: number;
  warningCount: number;
  /** First `maxIssues` of each kind. */
  errors: IngestionIssue[];
  warnings: IngestionIssue[];
}
