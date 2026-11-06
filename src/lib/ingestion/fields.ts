import type { ColumnMapping, FieldKey, IngestionSource } from './types';

export interface FieldDef {
  key: FieldKey;
  label: string;
  required: readonly IngestionSource[];
  /** Header spellings, compared after `normalizeHeader`. */
  aliases: readonly string[];
}

const BOTH: readonly IngestionSource[] = ['PURCHASE_REGISTER', 'GSTR2B'];
const NONE: readonly IngestionSource[] = [];

/**
 * Covers Tally / Busy / SAP purchase-register exports and the GST portal's GSTR-2B
 * Excel download ("GSTIN of supplier", "Integrated Tax(₹)", ...).
 */
export const FIELDS: readonly FieldDef[] = [
  {
    key: 'supplierGstin',
    label: 'Vendor GSTIN',
    required: BOTH,
    aliases: [
      'gstin', 'gstinofsupplier', 'suppliergstin', 'vendorgstin', 'partygstin', 'partygstinuin',
      'gstinuin', 'gstinuinofsupplier', 'gstno', 'gstnumber', 'gstinnumber', 'ctin', 'sellergstin',
    ],
  },
  {
    key: 'supplierName',
    label: 'Vendor name',
    required: NONE,
    aliases: [
      'suppliername', 'vendorname', 'partyname', 'tradename', 'tradelegalname', 'legalname',
      'nameofsupplier', 'ledgername', 'particulars', 'name', 'trdnm', 'sellername',
    ],
  },
  {
    key: 'invoiceNumber',
    label: 'Invoice number',
    required: BOTH,
    aliases: [
      'invoicenumber', 'invoiceno', 'invno', 'invnumber', 'supplierinvoiceno', 'supplierinvoicenumber',
      'billno', 'billnumber', 'documentnumber', 'documentno', 'docno', 'docnumber', 'referenceno',
      'refno', 'inum', 'notenumber', 'noteno', 'ntnum', 'creditdebitnotenumber', 'creditdebitnoteno',
    ],
  },
  {
    key: 'invoiceDate',
    label: 'Invoice date',
    required: BOTH,
    aliases: [
      'invoicedate', 'invdate', 'supplierinvoicedate', 'billdate', 'documentdate', 'docdate',
      'notedate', 'creditdebitnotedate', 'date', 'dt',
    ],
  },
  {
    key: 'documentType',
    label: 'Document type',
    required: NONE,
    aliases: ['documenttype', 'doctype', 'notetype', 'invoicetype', 'type', 'typ', 'vouchertype'],
  },
  {
    key: 'taxableValue',
    label: 'Taxable value',
    required: BOTH,
    aliases: [
      'taxablevalue', 'taxableamount', 'nettaxablevalue', 'taxable', 'assessablevalue', 'txval',
      'taxableamt',
    ],
  },
  {
    key: 'igst',
    label: 'IGST',
    required: NONE,
    aliases: ['igst', 'igstamount', 'igstamt', 'integratedtax', 'integratedtaxamount', 'iamt'],
  },
  {
    key: 'cgst',
    label: 'CGST',
    required: NONE,
    aliases: ['cgst', 'cgstamount', 'cgstamt', 'centraltax', 'centraltaxamount', 'camt'],
  },
  {
    key: 'sgst',
    label: 'SGST/UTGST',
    required: NONE,
    aliases: [
      'sgst', 'sgstamount', 'sgstamt', 'utgst', 'sgstutgst', 'statetax', 'stateuttax',
      'stateuttaxamount', 'samt',
    ],
  },
  {
    key: 'cess',
    label: 'Cess',
    required: NONE,
    aliases: ['cess', 'cessamount', 'cessamt', 'csamt'],
  },
  {
    key: 'returnPeriod',
    label: 'Return period',
    required: NONE,
    aliases: ['returnperiod', 'taxperiod', 'period', 'gstr1iffgstr5period', 'gstr1period', 'rtnprd', 'supprd'],
  },
  {
    key: 'itcAvailable',
    label: 'ITC availability',
    required: NONE,
    aliases: ['itcavailability', 'itcavailable', 'itcavl', 'itceligibility', 'eligibility'],
  },
  {
    key: 'reverseCharge',
    label: 'Reverse charge',
    required: NONE,
    aliases: ['reversecharge', 'supplyattractreversecharge', 'rcm', 'rev', 'isreversecharge'],
  },
  {
    key: 'originalInvoiceNumber',
    label: 'Original invoice number (amendments)',
    required: NONE,
    aliases: ['originalinvoicenumber', 'originalinvoiceno', 'oinum', 'originalnotenumber', 'ontnum'],
  },
  {
    key: 'originalInvoiceDate',
    label: 'Original invoice date (amendments)',
    required: NONE,
    aliases: ['originalinvoicedate', 'oidt', 'originalnotedate', 'ontdt'],
  },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** "Integrated Tax (₹)" -> "integratedtax", "Taxable Value Rs." -> "taxablevalue" */
export function normalizeHeader(header: string): string {
  return header
    .replace(/(?:^|[\s(_\-])(?:₹|rs\.?|inr)\s*\)?\s*$/i, '') // trailing currency marker only
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const ALIAS_TO_FIELD = new Map<string, FieldKey>();
for (const f of FIELDS) for (const a of f.aliases) ALIAS_TO_FIELD.set(a, f.key);

export function fieldForHeader(header: string): FieldKey | undefined {
  const n = normalizeHeader(header);
  return ALIAS_TO_FIELD.get(n) ?? (n.endsWith('amount') ? ALIAS_TO_FIELD.get(n.slice(0, -6)) : undefined);
}

export interface MappingResult {
  mapping: ColumnMapping;
  missingRequired: FieldKey[];
  unmappedHeaders: string[];
  /**
   * Required fields matched by several columns (e.g. GSTR-2B amendment sheets have an
   * original and a revised "Invoice number") and not resolved by an override.
   */
  ambiguous: FieldKey[];
}

/** First header wins for each field; explicit `overrides` take precedence. */
export function autoMapColumns(
  headers: string[],
  source: IngestionSource,
  overrides: ColumnMapping = {},
): MappingResult {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const [field, header] of Object.entries(overrides) as [FieldKey, string][]) {
    if (header && headers.includes(header)) {
      mapping[field] = header;
      used.add(header);
    }
  }
  for (const header of headers) {
    if (used.has(header)) continue;
    const field = fieldForHeader(header);
    if (field && !mapping[field]) {
      mapping[field] = header;
      used.add(header);
    }
  }
  const missingRequired = FIELDS.filter((f) => f.required.includes(source) && !mapping[f.key]).map(
    (f) => f.key,
  );
  const unmappedHeaders = headers.filter((h) => h && !used.has(h));

  // Duplicate headers arrive de-duplicated as "Invoice number (2)"; compare their base names.
  const counts = new Map<FieldKey, number>();
  for (const header of headers) {
    const field = header ? fieldForHeader(header.replace(/\s\(\d+\)$/, '')) : undefined;
    if (field) counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  const ambiguous = FIELDS.filter(
    (f) => f.required.includes(source) && (counts.get(f.key) ?? 0) > 1 && !overrides[f.key],
  ).map((f) => f.key);

  return { mapping, missingRequired, unmappedHeaders, ambiguous };
}

/** Number of distinct known fields a row of cells would map to (header-row detection). */
export function headerScore(cells: unknown[]): number {
  const fields = new Set<FieldKey>();
  for (const cell of cells) {
    if (typeof cell !== 'string') continue;
    const f = fieldForHeader(cell);
    if (f) fields.add(f);
  }
  return fields.size;
}
