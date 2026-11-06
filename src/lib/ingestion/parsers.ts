import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { headerScore } from './fields';
import type { FieldKey, RawRecord } from './types';
import { plainCellValue } from './values';

/** A worksheet (or the single CSV table) as a stream of raw cell arrays. */
export interface Sheet {
  name: string;
  rows: AsyncIterable<unknown[]>;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_CHUNK_CHARS = 64 * 1024;

/**
 * Papa's stream parser is quadratic in chunk size (a 3 MB single chunk takes ~45 s), so
 * input is re-cut into 64 KB string chunks. StringDecoder keeps multi-byte UTF-8
 * characters intact across chunk boundaries.
 */
async function* rechunk(input: Readable): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  for await (const chunk of input) {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk as Buffer);
    for (let i = 0; i < text.length; i += CSV_CHUNK_CHARS) yield text.slice(i, i + CSV_CHUNK_CHARS);
  }
  const tail = decoder.end();
  if (tail) yield tail;
}

export function csvSheet(input: Readable, name = ''): Sheet {
  async function* rows() {
    // Empty lines are kept so row numbers match what the user sees in Excel.
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, { header: false, skipEmptyLines: false });
    const source = Readable.from(rechunk(input));
    source.on('error', (err) => parser.destroy(err));
    source.pipe(parser);
    let first = true;
    for await (const row of parser as AsyncIterable<string[]>) {
      if (first && typeof row[0] === 'string') row[0] = row[0].replace(/^﻿/, '');
      first = false;
      yield row as unknown[];
    }
  }
  return { name, rows: rows() };
}

// ---------------------------------------------------------------------------
// XLSX (streaming; never loads the whole workbook)
// ---------------------------------------------------------------------------

/**
 * GSTR-2B amendment sheets carry two "Invoice number" columns (original + revised) under
 * merged group headers, which a flat header row cannot disambiguate. Amendments are
 * ingested from the 2B JSON instead.
 */
const SKIPPED_XLSX_SHEETS = /^(b2ba|b2b-?cdnra|ecoa|impga?|isda)$/i;

export async function* xlsxSheets(
  input: Readable,
): AsyncGenerator<Sheet & { skippedReason?: string }> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'cache',
    worksheets: 'emit',
    entries: 'emit',
  });
  // ExcelJS crashes if a worksheet entry precedes xl/workbook.xml in the zip (the order
  // ExcelJS itself writes). An empty model avoids the crash; such sheets lose their name
  // and fall back to "Sheet<n>", and amendment sheets are then caught by their duplicate
  // invoice-number columns (see autoMapColumns().ambiguous).
  const r = reader as unknown as { model?: { sheets?: unknown[] }; properties?: { model?: object } };
  r.model ??= { sheets: [] };
  r.properties ??= { model: { date1904: false } };
  for await (const ws of reader) {
    const meta = ws as unknown as { name?: string; id?: string | number };
    const name = meta.name ?? `Sheet${meta.id ?? ''}`;
    if (SKIPPED_XLSX_SHEETS.test(name.trim())) {
      // The stream must still be drained before the next sheet is emitted.
      for await (const _ of ws) void _;
      yield { name, rows: (async function* () {})(), skippedReason: 'amendment sheet (use GSTR-2B JSON)' };
      continue;
    }
    async function* rows() {
      for await (const row of ws) {
        const values = Array.isArray(row.values) ? row.values : Object.values(row.values ?? {});
        // ExcelJS rows are 1-based and sparse; index 0 is always empty.
        const cells: unknown[] = [];
        for (let i = 1; i < values.length; i++) cells.push(plainCellValue(values[i]));
        yield Object.assign(cells, { rowNumber: row.number });
      }
    }
    yield { name, rows: rows() };
  }
}

// ---------------------------------------------------------------------------
// Header detection -> records
// ---------------------------------------------------------------------------

const MIN_HEADER_SCORE = 3;
const HEADER_SCAN_ROWS = 25;

const cellText = (c: unknown) => (c === null || c === undefined ? '' : String(c).trim());

/** Bottom row wins where it has text; merged group cells above fill the gaps. */
function mergeHeaderRows(top: unknown[], bottom: unknown[]): string[] {
  const width = Math.max(top.length, bottom.length);
  return Array.from({ length: width }, (_, i) => cellText(bottom[i]) || cellText(top[i]));
}

/**
 * Finds the header row within the first rows of a sheet (exports often start with a
 * company name/title block) and yields every following row keyed by header text.
 * Two-row headers are merged: GSTR-2B puts "GSTIN of supplier" in one row and
 * "Invoice number" (under a merged "Invoice details" cell) in the row below.
 * Yields nothing if no plausible header row is found.
 */
export async function* recordsFromSheet(
  sheet: Sheet,
  /** Header names the user mapped explicitly; they count towards header detection. */
  extraHeaders: Iterable<string> = [],
): AsyncGenerator<RawRecord> {
  const extra = new Set([...extraHeaders].map((h) => h.trim()));
  const score = (cells: unknown[]) =>
    headerScore(cells) + cells.filter((c) => typeof c === 'string' && extra.has(c.trim())).length;
  let previous: unknown[] = [];
  let candidate: string[] | null = null;
  let headers: string[] | null = null;
  let index = 0;

  for await (const cells of sheet.rows) {
    index++;
    const rowNumber = (cells as unknown[] & { rowNumber?: number }).rowNumber ?? index;
    if (!headers) {
      if (candidate) {
        if (score(cells) >= 2) {
          headers = dedupeHeaders(mergeHeaderRows(candidate, cells));
          continue;
        }
        headers = dedupeHeaders(candidate);
        // fall through: this row is data
      } else {
        if (score(cells) >= MIN_HEADER_SCORE) {
          candidate = score(previous) >= 1 ? mergeHeaderRows(previous, cells) : cells.map(cellText);
        } else if (index >= HEADER_SCAN_ROWS) {
          return;
        }
        previous = cells;
        continue;
      }
    }
    if (cells.every((c) => cellText(c) === '')) continue;
    const values: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h) values[h] = cells[i] ?? null;
    });
    yield { rowNumber, sheet: sheet.name || undefined, values };
  }
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    if (!h) return h;
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });
}

// ---------------------------------------------------------------------------
// GSTR-2B JSON (official portal download)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

interface Gstr2bDoc extends Json {
  items?: Json[];
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

function docAmounts(doc: Gstr2bDoc) {
  const keys = ['txval', 'igst', 'cgst', 'sgst', 'cess'] as const;
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<(typeof keys)[number], number>;
  const hasTopLevel = keys.some((k) => doc[k] !== undefined);
  if (hasTopLevel) {
    for (const k of keys) out[k] = num(doc[k]);
  } else {
    for (const item of doc.items ?? []) for (const k of keys) out[k] += num(item[k]);
  }
  return out;
}

/** Records keyed by FieldKey; pair with `IDENTITY_MAPPING`. */
export const IDENTITY_MAPPING = {
  supplierGstin: 'supplierGstin',
  supplierName: 'supplierName',
  invoiceNumber: 'invoiceNumber',
  invoiceDate: 'invoiceDate',
  documentType: 'documentType',
  taxableValue: 'taxableValue',
  igst: 'igst',
  cgst: 'cgst',
  sgst: 'sgst',
  cess: 'cess',
  returnPeriod: 'returnPeriod',
  itcAvailable: 'itcAvailable',
  reverseCharge: 'reverseCharge',
  originalInvoiceNumber: 'originalInvoiceNumber',
  originalInvoiceDate: 'originalInvoiceDate',
} as const satisfies Record<FieldKey, FieldKey>;

const SECTIONS = [
  { key: 'b2b', docs: 'inv', number: 'inum', original: 'oinum', originalDate: 'oidt', type: 'typ' },
  { key: 'b2ba', docs: 'inv', number: 'inum', original: 'oinum', originalDate: 'oidt', type: 'typ' },
  { key: 'cdnr', docs: 'nt', number: 'ntnum', original: 'ontnum', originalDate: 'ontdt', type: 'typ' },
  { key: 'cdnra', docs: 'nt', number: 'ntnum', original: 'ontnum', originalDate: 'ontdt', type: 'typ' },
] as const;

export interface Gstr2bJsonResult {
  gstin: string | null;
  returnPeriod: string | null;
  ignoredSections: string[];
  records: RawRecord[];
}

/**
 * Flattens a GSTR-2B JSON download into records. Originals (b2b/cdnr) come before their
 * amendments (b2ba/cdnra) so a later amendment overrides the original on upsert.
 */
export function parseGstr2bJson(input: unknown): Gstr2bJsonResult {
  const root = ((input as Json)?.data ?? input) as Json;
  const docdata = root?.docdata as Json | undefined;
  if (!docdata || typeof docdata !== 'object') {
    throw new Error('Not a GSTR-2B JSON file: "docdata" section not found');
  }
  const returnPeriod = typeof root.rtnprd === 'string' ? root.rtnprd : null;
  const records: RawRecord[] = [];
  const known = new Set<string>(SECTIONS.map((s) => s.key));
  const ignoredSections = Object.keys(docdata).filter((k) => !known.has(k));

  for (const section of SECTIONS) {
    const suppliers = (docdata[section.key] as Json[] | undefined) ?? [];
    let n = 0;
    for (const supplier of suppliers) {
      for (const doc of (supplier[section.docs] as Gstr2bDoc[] | undefined) ?? []) {
        const a = docAmounts(doc);
        records.push({
          rowNumber: ++n,
          sheet: section.key,
          values: {
            supplierGstin: supplier.ctin,
            supplierName: supplier.trdnm ?? null,
            invoiceNumber: doc[section.number],
            invoiceDate: doc.dt,
            documentType: doc[section.type] ?? (section.docs === 'nt' ? 'C' : 'R'),
            taxableValue: a.txval,
            igst: a.igst,
            cgst: a.cgst,
            sgst: a.sgst,
            cess: a.cess,
            returnPeriod,
            itcAvailable: doc.itcavl ?? 'Y',
            reverseCharge: doc.rev ?? 'N',
            originalInvoiceNumber: doc[section.original] ?? null,
            originalInvoiceDate: doc[section.originalDate] ?? null,
          },
        });
      }
    }
  }
  return { gstin: typeof root.gstin === 'string' ? root.gstin : null, returnPeriod, ignoredSections, records };
}
