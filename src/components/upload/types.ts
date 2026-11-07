import type { FilePreview } from '@/lib/ingestion/preview';
import type { ColumnMapping, FieldKey, IngestionSummary } from '@/lib/ingestion/types';

export type Source = 'PURCHASE_REGISTER' | 'GSTR2B';
export type Preview = FilePreview & { fileName: string; size: number };
export type { ColumnMapping, FieldKey, IngestionSummary };

export interface UploadResponse {
  batchId: string;
  summary: IngestionSummary | null;
  error?: string;
}

export const SOURCE_LABEL: Record<Source, string> = {
  PURCHASE_REGISTER: 'Purchase register',
  GSTR2B: 'GSTR-2B',
};

/** Fields shown in the mapping table, per source. */
export const VISIBLE_FIELDS: Record<Source, FieldKey[]> = {
  PURCHASE_REGISTER: ['supplierGstin', 'supplierName', 'invoiceNumber', 'invoiceDate', 'documentType', 'taxableValue', 'igst', 'cgst', 'sgst', 'cess'],
  GSTR2B: [
    'supplierGstin', 'supplierName', 'invoiceNumber', 'invoiceDate', 'documentType', 'taxableValue', 'igst', 'cgst', 'sgst', 'cess',
    'returnPeriod', 'itcAvailable', 'reverseCharge',
  ],
};

export const FIELD_HELP: Partial<Record<FieldKey, string>> = {
  supplierGstin: '15-character GSTIN of the vendor',
  invoiceNumber: "The supplier's invoice number, not your voucher number",
  invoiceDate: 'Date on the supplier invoice',
  documentType: 'Invoice, credit note or debit note. If there is no column, negative amounts are read as credit notes',
  taxableValue: 'Value before tax',
  returnPeriod: 'Month the supplier filed in (defaults to the invoice month)',
  itcAvailable: 'GSTR-2B "ITC availability" (Yes/No)',
};
