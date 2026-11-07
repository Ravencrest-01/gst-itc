'use client';

import { BookOpen, FileJson, FileSpreadsheet, Landmark, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FIELD_BY_KEY } from '@/lib/ingestion/fields';
import type { PreviewSheet } from '@/lib/ingestion/preview';
import { apiPostForm, ApiError, uploadWithProgress } from '@/lib/ui/api';
import { formatBytes, formatCount } from '@/lib/ui/format';
import { Alert, Badge, Button, Card, CardHeader, cx, Spinner } from '@/components/ui';
import { FileDropzone } from './file-dropzone';
import { Gstr2bSync } from './gstr2b-sync';
import { DataPreview, MappingEditor, SampleIssues } from './mapping-editor';
import { RecentUploads } from './recent-uploads';
import { SOURCE_LABEL, type ColumnMapping, type FieldKey, type Preview, type Source, type UploadResponse } from './types';
import { UploadResult } from './upload-result';

type Step =
  | { name: 'select' }
  | { name: 'reading'; file: File }
  | { name: 'mapping'; file: File; preview: Preview }
  | { name: 'uploading'; file: File; preview: Preview; progress: number }
  | { name: 'done'; file: File; response: UploadResponse };

/** Re-reading the file to refresh sample checks is only worth it for smaller files. */
const LIVE_RECHECK_BYTES = 10 * 1024 * 1024;

function primarySheet(preview: Preview): PreviewSheet | undefined {
  return preview.sheets.find((s) => !s.skippedReason && s.rowCount > 0);
}

export function UploadWorkbench() {
  const [source, setSource] = useState<Source>('PURCHASE_REGISTER');
  const [step, setStep] = useState<Step>({ name: 'select' });
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  function reset() {
    abort.current?.abort();
    setStep({ name: 'select' });
    setMapping({});
    setError(null);
  }

  async function readFile(file: File, overrides: ColumnMapping = {}) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    if (!Object.keys(overrides).length) setStep({ name: 'reading', file });
    const form = new FormData();
    form.set('file', file);
    form.set('source', source);
    if (Object.keys(overrides).length) form.set('mapping', JSON.stringify(overrides));
    try {
      const preview = await apiPostForm<Preview>('/api/ingestion/preview', form, ctrl.signal);
      const sheet = primarySheet(preview);
      if (!sheet && preview.format !== 'json') {
        const reasons = preview.sheets.map((s) => `${s.name || 'file'}: ${s.skippedReason}`).join('; ');
        throw new ApiError(422, `No table with invoice columns was found. ${reasons}`);
      }
      setStep({ name: 'mapping', file, preview });
      if (!Object.keys(overrides).length) setMapping(sheet?.mapping ?? {});
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof ApiError ? err.message : 'The file could not be read.');
      setStep({ name: 'select' });
    }
  }

  function changeMapping(field: FieldKey, header: string | null) {
    if (step.name !== 'mapping') return;
    const next: ColumnMapping = { ...mapping };
    // A column can feed one field only: moving it clears the field that had it.
    for (const [f, h] of Object.entries(next)) if (header && h === header) delete next[f as FieldKey];
    if (header) next[field] = header;
    else delete next[field];
    setMapping(next);
    // Refresh the sample-row checks against the new mapping.
    if (step.file.size <= LIVE_RECHECK_BYTES) void readFile(step.file, explicitOverrides(next, step.preview));
  }

  async function upload() {
    if (step.name !== 'mapping') return;
    const { file, preview } = step;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStep({ name: 'uploading', file, preview, progress: 0 });
    const form = new FormData();
    form.set('file', file);
    form.set('source', source);
    if (preview.format !== 'json') form.set('mapping', JSON.stringify(mapping));
    try {
      const response = await uploadWithProgress<UploadResponse>(
        '/api/ingestion',
        form,
        (progress) => setStep((s) => (s.name === 'uploading' ? { ...s, progress } : s)),
        ctrl.signal,
      );
      setStep({ name: 'done', file, response });
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as UploadResponse | undefined) : undefined;
      if (body?.summary !== undefined || body?.error) {
        setStep({ name: 'done', file, response: { batchId: body.batchId ?? '', summary: body.summary ?? null, error: body.error } });
      } else {
        setError(err instanceof ApiError ? err.message : 'Upload failed');
        setStep({ name: 'mapping', file, preview });
      }
    } finally {
      setRefreshKey((k) => k + 1);
    }
  }

  const busy = step.name === 'reading' || step.name === 'uploading';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Upload invoice data</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Bring in your purchase register and the GSTR-2B statements from the GST portal. Columns are matched automatically;
          check them before anything is saved.
        </p>
      </header>

      <SourcePicker value={source} disabled={step.name !== 'select'} onChange={(s) => { setSource(s); setError(null); }} />

      {error && (
        <Alert tone="danger" title="That file could not be used">
          {error}
        </Alert>
      )}

      {step.name === 'select' && (
        <>
          <FileDropzone source={source} onFile={(f) => readFile(f)} onReject={setError} />
          {source === 'GSTR2B' && <Gstr2bSync onDone={() => setRefreshKey((k) => k + 1)} />}
        </>
      )}

      {step.name === 'reading' && (
        <Card className="flex items-center gap-3 px-5 py-6 text-sm">
          <Spinner className="text-accent" />
          Reading {step.file.name} ({formatBytes(step.file.size)}) and detecting columns…
        </Card>
      )}

      {(step.name === 'mapping' || step.name === 'uploading') && (
        <MappingStep
          file={step.file}
          preview={step.preview}
          source={source}
          mapping={mapping}
          onChange={changeMapping}
          onCancel={reset}
          onUpload={upload}
          uploading={step.name === 'uploading' ? step.progress : null}
        />
      )}

      {step.name === 'done' && (
        <UploadResult
          fileName={step.file.name}
          source={source}
          summary={step.response.summary}
          failure={step.response.error}
          onReset={reset}
        />
      )}

      <RecentUploads refreshKey={refreshKey} />
      {busy && <span className="sr-only" aria-live="polite">Working…</span>}
    </div>
  );
}

/** Only fields the user changed from the automatic mapping are sent as overrides. */
function explicitOverrides(mapping: ColumnMapping, preview: Preview): ColumnMapping {
  const auto = primarySheet(preview)?.mapping ?? {};
  return Object.fromEntries(Object.entries(mapping).filter(([f, h]) => auto[f as FieldKey] !== h)) as ColumnMapping;
}

function SourcePicker({ value, disabled, onChange }: { value: Source; disabled: boolean; onChange: (s: Source) => void }) {
  const options: { id: Source; title: string; text: string; icon: typeof BookOpen }[] = [
    { id: 'PURCHASE_REGISTER', title: 'Purchase register', text: 'Your books: Tally, Busy or ERP export', icon: BookOpen },
    { id: 'GSTR2B', title: 'GSTR-2B', text: 'What suppliers filed, from the GST portal', icon: Landmark },
  ];
  return (
    <div role="radiogroup" aria-label="What are you uploading?" className="grid gap-3 sm:grid-cols-2">
      {options.map(({ id, title, text, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${title}: ${text}`}
            disabled={disabled && !active}
            onClick={() => onChange(id)}
            className={cx(
              'flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border bg-surface hover:border-border-strong',
            )}
          >
            <Icon className={cx('mt-0.5 size-5 shrink-0', active ? 'text-accent' : 'text-muted')} aria-hidden />
            <span>
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-xs text-muted">{text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MappingStep({
  file,
  preview,
  source,
  mapping,
  onChange,
  onCancel,
  onUpload,
  uploading,
}: {
  file: File;
  preview: Preview;
  source: Source;
  mapping: ColumnMapping;
  onChange: (field: FieldKey, header: string | null) => void;
  onCancel: () => void;
  onUpload: () => void;
  uploading: number | null;
}) {
  const sheet = primarySheet(preview);
  const isJson = preview.format === 'json';
  const totalRows = preview.sheets.reduce((n, s) => n + s.rowCount, 0);
  const missing = useMemo(
    () => (isJson || !sheet ? [] : [...FIELD_BY_KEY.values()].filter((f) => f.required.includes(source) && !mapping[f.key])),
    [isJson, sheet, source, mapping],
  );
  const FormatIcon = isJson ? FileJson : FileSpreadsheet;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FormatIcon className="size-4 text-muted" aria-hidden />
            {file.name}
          </span>
        }
        description={`${SOURCE_LABEL[source]} · ${preview.format.toUpperCase()} · ${formatBytes(file.size)} · ${formatCount(totalRows)} rows found`}
        action={
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={uploading !== null} aria-label="Cancel and choose another file">
            <X className="size-4" aria-hidden /> Cancel
          </Button>
        }
      />

      {preview.sheets.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
          {preview.sheets.map((s) => (
            <Badge key={s.name} tone={s.skippedReason ? 'neutral' : s === sheet ? 'accent' : 'success'}>
              {s.name}: {s.skippedReason ? `skipped (${s.skippedReason})` : `${formatCount(s.rowCount)} rows`}
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-5 py-5">
        {isJson ? (
          <div className="px-5">
            <Alert tone="success" title="GSTR-2B JSON from the GST portal recognised">
              {preview.gstr2b?.returnPeriod && `Return period ${preview.gstr2b.returnPeriod.slice(0, 2)}/${preview.gstr2b.returnPeriod.slice(2)}. `}
              Columns are fixed in this format, so no mapping is needed. Amendments (B2BA, CDNRA) replace the original documents.
            </Alert>
          </div>
        ) : sheet ? (
          <>
            {preview.sheets.length > 1 && (
              <p className="px-5 text-xs text-muted">
                Your choices apply to <span className="font-medium text-fg">{sheet.name}</span>; other sheets with the same column names use them too.
              </p>
            )}
            <MappingEditor sheet={sheet} source={source} mapping={mapping} onChange={onChange} />
            {sheet.ambiguous.length > 0 && (
              <div className="px-5">
                <Alert tone="warning" title="Several columns could be the invoice number or date">
                  Pick the right ones above. Amendment sheets list both the original and the revised invoice.
                </Alert>
              </div>
            )}
            <div className="px-5"><SampleIssues sheet={sheet} /></div>
            <details className="mx-5 rounded-lg border border-border">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">First {sheet.sampleRows.length} rows of {sheet.name || 'the file'}</summary>
              <div className="border-t border-border"><DataPreview sheet={sheet} mapping={mapping} /></div>
            </details>
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 pt-5">
          {missing.length > 0 && (
            <span className="mr-auto text-sm text-danger">
              Map {missing.map((f) => f.label).join(', ')} to continue
            </span>
          )}
          {uploading !== null && (
            <div className="mr-auto flex min-w-60 flex-1 items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(uploading * 100)}
              >
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(4, uploading * 100)}%` }} />
              </div>
              <span className="whitespace-nowrap text-xs text-muted">
                {uploading < 1 ? `Uploading ${Math.round(uploading * 100)}%` : 'Checking and saving rows…'}
              </span>
            </div>
          )}
          <Button variant="secondary" onClick={onCancel} disabled={uploading !== null}>Cancel</Button>
          <Button onClick={onUpload} disabled={missing.length > 0 || uploading !== null}>
            {uploading !== null && <Spinner />}
            Import {formatCount(totalRows)} rows
          </Button>
        </div>
      </div>
    </Card>
  );
}
