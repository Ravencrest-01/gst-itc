'use client';

import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { FIELD_BY_KEY } from '@/lib/ingestion/fields';
import type { PreviewSheet } from '@/lib/ingestion/preview';
import { Badge, cx } from '@/components/ui';
import { FIELD_HELP, VISIBLE_FIELDS, type ColumnMapping, type FieldKey, type Source } from './types';

const UNMAPPED = '';

export function MappingEditor({
  sheet,
  source,
  mapping,
  onChange,
}: {
  sheet: PreviewSheet;
  source: Source;
  mapping: ColumnMapping;
  onChange: (field: FieldKey, header: string | null) => void;
}) {
  const used = new Map(Object.entries(mapping).map(([f, h]) => [h, f]));
  const fields = VISIBLE_FIELDS[source];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Map each field to a column in {sheet.name || 'the file'}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="px-5 py-2 font-medium">Field</th>
            <th scope="col" className="px-3 py-2 font-medium">Column in your file</th>
            <th scope="col" className="px-3 py-2 font-medium">Sample values</th>
            <th scope="col" className="px-5 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((key) => {
            const def = FIELD_BY_KEY.get(key)!;
            const required = def.required.includes(source);
            const header = mapping[key];
            const samples = header ? sheet.sampleRows.map((r) => r[header]).filter(Boolean).slice(0, 3) : [];
            const auto = header && sheet.mapping[key] === header;
            return (
              <tr key={key} className="border-b border-border last:border-0">
                <th scope="row" className="px-5 py-2.5 text-left align-top font-normal">
                  <div className="flex items-center gap-1.5 font-medium">
                    {def.label}
                    {required && <span className="text-danger" aria-label="required">*</span>}
                  </div>
                  {FIELD_HELP[key] && <div className="mt-0.5 max-w-64 text-xs text-subtle">{FIELD_HELP[key]}</div>}
                </th>
                <td className="px-3 py-2.5 align-top">
                  <select
                    aria-label={`Column for ${def.label}`}
                    value={header ?? UNMAPPED}
                    onChange={(e) => onChange(key, e.target.value || null)}
                    className={cx(
                      'h-9 w-full min-w-48 rounded-md border bg-surface px-2 text-sm',
                      required && !header ? 'border-danger' : 'border-border-strong',
                    )}
                  >
                    <option value={UNMAPPED}>— Not in this file —</option>
                    {sheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                        {used.get(h) && used.get(h) !== key ? ` (used for ${FIELD_BY_KEY.get(used.get(h) as FieldKey)?.label})` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5 align-top font-mono text-xs text-muted">
                  {samples.length ? samples.map((s, i) => <div key={i} className="max-w-56 truncate" title={s}>{s}</div>) : <span className="text-subtle">—</span>}
                </td>
                <td className="px-5 py-2.5 align-top">
                  {header ? (
                    <Badge tone="success">
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      {auto ? 'Auto-mapped' : 'Mapped'}
                    </Badge>
                  ) : required ? (
                    <Badge tone="danger">
                      <XCircle className="size-3.5" aria-hidden />
                      Required
                    </Badge>
                  ) : (
                    <Badge>
                      <CircleDashed className="size-3.5" aria-hidden />
                      Optional
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** First rows of the file, with mapped columns labelled by their field. */
export function DataPreview({ sheet, mapping }: { sheet: PreviewSheet; mapping: ColumnMapping }) {
  const fieldFor = new Map(Object.entries(mapping).map(([f, h]) => [h, FIELD_BY_KEY.get(f as FieldKey)?.label]));
  if (!sheet.sampleRows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">First {sheet.sampleRows.length} rows of {sheet.name || 'the file'}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left">
            {sheet.headers.map((h) => (
              <th key={h} scope="col" className={cx('whitespace-nowrap px-3 py-2 font-medium', fieldFor.has(h) ? 'text-accent' : 'text-subtle')}>
                <div className="text-[10px] uppercase tracking-wide">{fieldFor.get(h) ?? 'not used'}</div>
                <div className={fieldFor.has(h) ? 'text-fg' : ''}>{h}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.sampleRows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {sheet.headers.map((h) => (
                <td key={h} className={cx('max-w-48 truncate whitespace-nowrap px-3 py-1.5 font-mono', !fieldFor.has(h) && 'text-subtle')} title={row[h]}>
                  {row[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SampleIssues({ sheet }: { sheet: PreviewSheet }) {
  if (!sheet.sampleIssues.length) return null;
  return (
    <div className="rounded-lg bg-warning-soft px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-warning">
        <AlertTriangle className="size-4" aria-hidden />
        The first rows have problems with this mapping
      </div>
      <ul className="mt-1.5 space-y-0.5 text-fg/80">
        {sheet.sampleIssues.slice(0, 6).map((i, n) => (
          <li key={n}>
            Row {i.row}
            {i.field ? ` · ${FIELD_BY_KEY.get(i.field)?.label}` : ''}: {i.message}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-muted">You can still upload: rows with errors are skipped and listed afterwards.</p>
    </div>
  );
}
