import { Readable } from 'node:stream';
import { autoMapColumns } from './fields';
import {
  csvSheet,
  IDENTITY_MAPPING,
  parseGstr2bJson,
  recordsFromSheet,
  xlsxSheets,
  type Sheet,
} from './parsers';
import { mapRow } from './row-mapper';
import type {
  ColumnMapping,
  IngestionIssue,
  IngestionSink,
  IngestionSource,
  IngestionSummary,
  NormalizedRow,
  RawRecord,
} from './types';

export interface IngestOptions {
  source: IngestionSource;
  sink: IngestionSink;
  /** User overrides from the column-mapping UI; unmapped fields are auto-detected. */
  mapping?: ColumnMapping;
  /** Rows per bulk insert. Default 1,000. */
  batchSize?: number;
  /** Issues kept in the summary per kind (all are counted). Default 100. */
  maxIssues?: number;
}

export class IngestionError extends Error {
  constructor(
    message: string,
    readonly summary?: IngestionSummary,
  ) {
    super(message);
  }
}

/**
 * Maps, validates, de-duplicates and writes records in fixed-size batches, so memory
 * stays flat regardless of file size. A new sheet triggers a new column mapping.
 */
export async function ingestRecords(
  records: AsyncIterable<RawRecord> | Iterable<RawRecord>,
  options: IngestOptions,
): Promise<IngestionSummary> {
  const { source, sink } = options;
  const batchSize = options.batchSize ?? 1_000;
  const maxIssues = options.maxIssues ?? 100;

  const summary: IngestionSummary = {
    source,
    mappings: {},
    skippedSheets: [],
    rowCount: 0,
    validCount: 0,
    writtenCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    warningCount: 0,
    errors: [],
    warnings: [],
  };
  const addError = (i: IngestionIssue) => {
    summary.errorCount++;
    if (summary.errors.length < maxIssues) summary.errors.push(i);
  };
  const addWarning = (i: IngestionIssue) => {
    summary.warningCount++;
    if (summary.warnings.length < maxIssues) summary.warnings.push(i);
  };

  /** hash -> where it was first seen (whole file, for duplicate reporting). */
  const seen = new Map<string, { row: number; sheet?: string }>();
  /** hash -> index in the pending batch (for in-batch replacement). */
  let pendingIndex = new Map<string, number>();
  let pending: NormalizedRow[] = [];

  const flush = async () => {
    if (!pending.length) return;
    summary.writtenCount += await sink.write(pending);
    pending = [];
    pendingIndex = new Map();
  };

  let currentSheet: string | undefined;
  let mapping: ColumnMapping | null = null;
  let sheetSkipped = false;

  for await (const record of records) {
    const sheetKey = record.sheet ?? '';
    if (mapping === null || sheetKey !== currentSheet) {
      currentSheet = sheetKey;
      const result = autoMapColumns(Object.keys(record.values), source, options.mapping);
      sheetSkipped = result.missingRequired.length > 0 || result.ambiguous.length > 0;
      if (result.missingRequired.length) {
        summary.skippedSheets.push(sheetKey);
        addError({
          row: 0,
          sheet: record.sheet,
          message: `Required column(s) not found: ${result.missingRequired.join(', ')}`,
        });
      } else if (result.ambiguous.length) {
        summary.skippedSheets.push(sheetKey);
        addWarning({
          row: 0,
          sheet: record.sheet,
          message: `Sheet skipped: several columns match ${result.ambiguous.join(', ')} (amendment sheet?); map them explicitly or use GSTR-2B JSON`,
        });
      } else {
        summary.mappings[sheetKey] = result.mapping;
      }
      mapping = result.mapping;
    }
    if (sheetSkipped) continue;

    const result = mapRow(record, mapping, source);
    if (result.ok === 'skip') continue;
    summary.rowCount++;
    if (result.ok === false) {
      for (const e of result.errors) addError({ ...e, sheet: record.sheet });
      continue;
    }
    for (const w of result.warnings) addWarning({ ...w, sheet: record.sheet });
    const row: NormalizedRow = { ...result.row, sheet: record.sheet };
    summary.validCount++;

    const first = seen.get(row.normalizationHash);
    if (first) {
      summary.duplicateCount++;
      const where = `${first.sheet ? `${first.sheet} ` : ''}row ${first.row}`;
      if (source === 'PURCHASE_REGISTER') {
        // Booking the same supplier invoice twice is itself a finding: keep the first.
        addWarning({ row: row.rowNumber, sheet: row.sheet, message: `Duplicate of ${where}; skipped` });
        continue;
      }
      // GSTR-2B: a later document (amendment) supersedes the earlier one.
      if (!row.isAmendment) {
        addWarning({ row: row.rowNumber, sheet: row.sheet, message: `Duplicate of ${where}; later row kept` });
      }
      const at = pendingIndex.get(row.normalizationHash);
      if (at !== undefined) {
        pending[at] = row;
        continue;
      }
    } else {
      seen.set(row.normalizationHash, { row: row.rowNumber, sheet: row.sheet });
    }

    pendingIndex.set(row.normalizationHash, pending.length);
    pending.push(row);
    if (pending.length >= batchSize) await flush();
  }
  await flush();
  return summary;
}

export type FileFormat = 'csv' | 'xlsx' | 'json';

export function detectFormat(fileName: string): FileFormat {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (ext === 'json') return 'json';
  if (ext === 'xls') throw new IngestionError('Legacy .xls is not supported; save the file as .xlsx or .csv');
  throw new IngestionError(`Unsupported file type ".${ext}" (expected .csv, .xlsx or .json)`);
}

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '');
}

async function* recordsFromSheets(
  sheets: AsyncIterable<Sheet & { skippedReason?: string }>,
  onSkip: (name: string, reason: string) => void,
  extraHeaders: string[] = [],
): AsyncGenerator<RawRecord> {
  for await (const sheet of sheets) {
    if (sheet.skippedReason) {
      onSkip(sheet.name, sheet.skippedReason);
      continue;
    }
    let any = false;
    for await (const record of recordsFromSheet(sheet, extraHeaders)) {
      any = true;
      yield record;
    }
    if (!any) onSkip(sheet.name, 'no header row or data found');
  }
}

/** Parses a CSV, XLSX or GSTR-2B JSON stream and ingests it. */
export async function ingestFile(
  fileName: string,
  input: Readable | Buffer | string,
  options: IngestOptions,
): Promise<IngestionSummary> {
  const format = detectFormat(fileName);
  const stream = input instanceof Readable ? input : Readable.from([input]);
  const notes: { sheet: string; reason: string }[] = [];

  let summary: IngestionSummary;
  if (format === 'json') {
    if (options.source !== 'GSTR2B') throw new IngestionError('JSON upload is only supported for GSTR-2B');
    let json: unknown;
    try {
      json = JSON.parse(await readAll(stream));
    } catch {
      throw new IngestionError('File is not valid JSON');
    }
    let parsed;
    try {
      parsed = parseGstr2bJson(json);
    } catch (err) {
      throw new IngestionError((err as Error).message);
    }
    summary = await ingestRecords(parsed.records, { ...options, mapping: IDENTITY_MAPPING });
    for (const s of parsed.ignoredSections) notes.push({ sheet: s, reason: 'section not reconciled' });
  } else {
    const sheets = format === 'csv' ? (async function* () { yield csvSheet(stream); })() : xlsxSheets(stream);
    summary = await ingestRecords(
      recordsFromSheets(sheets, (sheet, reason) => notes.push({ sheet, reason }), Object.values(options.mapping ?? {})),
      options,
    );
  }

  for (const n of notes) {
    if (!summary.skippedSheets.includes(n.sheet)) summary.skippedSheets.push(n.sheet);
    summary.warningCount++;
    if (summary.warnings.length < (options.maxIssues ?? 100)) {
      summary.warnings.push({ row: 0, sheet: n.sheet || undefined, message: `Sheet skipped: ${n.reason}` });
    }
  }
  if (summary.rowCount === 0 && summary.errorCount === 0) {
    throw new IngestionError('No invoice rows found. Check that the file has a header row.', summary);
  }
  return summary;
}
