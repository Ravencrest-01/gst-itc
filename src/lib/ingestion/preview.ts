import { Readable } from 'node:stream';
import { autoMapColumns } from './fields';
import { csvSheet, IDENTITY_MAPPING, parseGstr2bJson, recordsFromSheet, xlsxSheets, type Sheet } from './parsers';
import { detectFormat, IngestionError, type FileFormat } from './pipeline';
import { mapRow } from './row-mapper';
import type { ColumnMapping, FieldKey, IngestionIssue, IngestionSource, RawRecord } from './types';

const SAMPLE_ROWS = 5;

export interface PreviewSheet {
  name: string;
  headers: string[];
  /** First rows as display strings, keyed by header. */
  sampleRows: Record<string, string>[];
  /** Data rows found in the sheet (blank rows excluded). */
  rowCount: number;
  mapping: ColumnMapping;
  missingRequired: FieldKey[];
  ambiguous: FieldKey[];
  unmappedHeaders: string[];
  /** Problems in the sample rows under this mapping, so the user can fix the mapping first. */
  sampleIssues: IngestionIssue[];
  skippedReason?: string;
}

export interface FilePreview {
  format: FileFormat;
  source: IngestionSource;
  sheets: PreviewSheet[];
  /** GSTR-2B JSON only */
  gstr2b?: { gstin: string | null; returnPeriod: string | null };
}

function display(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return String(value);
}

function summarizeSheet(
  name: string,
  samples: RawRecord[],
  rowCount: number,
  source: IngestionSource,
  overrides: ColumnMapping,
  fixedMapping?: ColumnMapping,
): PreviewSheet {
  const headers = samples.length ? Object.keys(samples[0].values).filter(Boolean) : [];
  const auto = autoMapColumns(headers, source, overrides);
  const mapping = fixedMapping ?? auto.mapping;
  // Problems caused only by a field not being mapped yet are already reported as "missing".
  const unmapped = new Set<FieldKey | undefined>(fixedMapping ? [] : auto.missingRequired);
  const sampleIssues = samples
    .flatMap((r) => {
      const result = mapRow(r, mapping, source);
      if (result.ok === false) return result.errors;
      if (result.ok === true) return result.warnings;
      return [];
    })
    .filter((i) => !unmapped.has(i.field));
  return {
    name,
    headers,
    sampleRows: samples.map((r) => Object.fromEntries(headers.map((h) => [h, display(r.values[h])]))),
    rowCount,
    mapping,
    missingRequired: fixedMapping ? [] : auto.missingRequired,
    ambiguous: fixedMapping ? [] : auto.ambiguous,
    unmappedHeaders: fixedMapping ? [] : auto.unmappedHeaders,
    sampleIssues,
  };
}

async function previewSheet(sheet: Sheet, source: IngestionSource, overrides: ColumnMapping): Promise<PreviewSheet> {
  const samples: RawRecord[] = [];
  let rowCount = 0;
  for await (const record of recordsFromSheet(sheet, Object.values(overrides))) {
    if (samples.length < SAMPLE_ROWS) samples.push(record);
    rowCount++;
  }
  const preview = summarizeSheet(sheet.name, samples, rowCount, source, overrides);
  if (!rowCount) preview.skippedReason = 'no header row or data found';
  return preview;
}

/**
 * Reads a file without saving anything: detected header row, sample rows, row count, the
 * automatic column mapping (with any user overrides), and the problems the sample rows
 * would have. Drives the column-mapping screen.
 */
export async function previewFile(
  fileName: string,
  input: Readable | Buffer | string,
  source: IngestionSource,
  overrides: ColumnMapping = {},
): Promise<FilePreview> {
  const format = detectFormat(fileName);
  const stream = input instanceof Readable ? input : Readable.from([input]);

  if (format === 'json') {
    if (source !== 'GSTR2B') throw new IngestionError('JSON upload is only supported for GSTR-2B');
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
    let parsed;
    try {
      parsed = parseGstr2bJson(JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '')));
    } catch (err) {
      throw new IngestionError(err instanceof SyntaxError ? 'File is not valid JSON' : (err as Error).message);
    }
    const bySection = new Map<string, RawRecord[]>();
    for (const r of parsed.records) bySection.set(r.sheet!, [...(bySection.get(r.sheet!) ?? []), r]);
    const sheets = [...bySection].map(([name, records]) =>
      summarizeSheet(name, records.slice(0, SAMPLE_ROWS), records.length, source, {}, IDENTITY_MAPPING),
    );
    for (const name of parsed.ignoredSections) {
      sheets.push({ ...summarizeSheet(name, [], 0, source, {}, IDENTITY_MAPPING), skippedReason: 'section not reconciled' });
    }
    return { format, source, sheets, gstr2b: { gstin: parsed.gstin, returnPeriod: parsed.returnPeriod } };
  }

  const sheets: PreviewSheet[] = [];
  const source$: AsyncIterable<Sheet & { skippedReason?: string }> =
    format === 'csv' ? (async function* () { yield csvSheet(stream); })() : xlsxSheets(stream);
  for await (const sheet of source$) {
    if (sheet.skippedReason) {
      sheets.push({ ...summarizeSheet(sheet.name, [], 0, source, overrides), skippedReason: sheet.skippedReason });
      continue;
    }
    sheets.push(await previewSheet(sheet, source, overrides));
  }
  return { format, source, sheets };
}
