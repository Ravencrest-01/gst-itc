'use client';

import { CheckCircle2, PlayCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { FIELD_BY_KEY } from '@/lib/ingestion/fields';
import { apiPost, ApiError } from '@/lib/ui/api';
import { currentFinancialYear, formatCount, formatInr, previousFinancialYear } from '@/lib/ui/format';
import { Alert, Badge, Button, Card, CardHeader, Spinner, Stat } from '@/components/ui';
import type { IngestionSummary, Source } from './types';

interface RunResponse {
  runId: string;
  summary: { totalPr: number; total2b: number; exactMatches: number; mismatches: number; totalItcAtRisk: number; section164RiskAmount: number; byStatus: Record<string, number> };
  dunningEligibleVendors: number;
}

/**
 * April–November: the previous FY, whose credit lapses on 30 November. December–March:
 * the current FY (the previous one has already lapsed).
 */
export function defaultFinancialYear(now = new Date()): string {
  const current = currentFinancialYear(now);
  const month = now.getMonth(); // 0 = January
  return month >= 3 && month <= 10 ? previousFinancialYear(current) : current;
}

export function UploadResult({
  fileName,
  source,
  summary,
  failure,
  onReset,
}: {
  fileName: string;
  source: Source;
  summary: IngestionSummary | null;
  failure?: string;
  onReset: () => void;
}) {
  const ok = !failure && summary && summary.writtenCount > 0;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {ok ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />}
            {ok ? `${fileName} uploaded` : `${fileName} could not be imported`}
          </span>
        }
        description={ok ? 'Rows are saved. Re-uploading the same file updates them instead of duplicating.' : failure}
        action={<Button variant="secondary" size="sm" onClick={onReset}>Upload another file</Button>}
      />
      {summary && (
        <div className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rows read" value={formatCount(summary.rowCount)} />
            <Stat label="Saved" value={formatCount(summary.writtenCount)} tone={summary.writtenCount ? 'success' : 'neutral'} />
            <Stat label="Rows with errors" value={formatCount(summary.errorCount)} tone={summary.errorCount ? 'danger' : 'neutral'} hint={summary.errorCount ? 'skipped' : undefined} />
            <Stat
              label={source === 'PURCHASE_REGISTER' ? 'Duplicate invoices' : 'Duplicates / amendments'}
              value={formatCount(summary.duplicateCount)}
              tone={summary.duplicateCount ? 'warning' : 'neutral'}
            />
          </div>
          <IssueTable title="Errors" tone="danger" issues={summary.errors} total={summary.errorCount} />
          <IssueTable title="Warnings" tone="warning" issues={summary.warnings} total={summary.warningCount} />
          {ok && <RunReconciliation />}
        </div>
      )}
    </Card>
  );
}

function IssueTable({ title, tone, issues, total }: { title: string; tone: 'danger' | 'warning'; issues: IngestionSummary['errors']; total: number }) {
  if (!issues.length) return null;
  return (
    <details open={tone === 'danger'} className="rounded-lg border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-medium">
        {title}
        <Badge tone={tone}>{formatCount(total)}</Badge>
        {total > issues.length && <span className="text-xs font-normal text-muted">showing first {issues.length}</span>}
      </summary>
      <div className="max-h-72 overflow-auto border-t border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Row</th>
              <th scope="col" className="px-4 py-2 font-medium">Sheet</th>
              <th scope="col" className="px-4 py-2 font-medium">Field</th>
              <th scope="col" className="px-4 py-2 font-medium">Problem</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i, n) => (
              <tr key={n} className="border-t border-border">
                <td className="px-4 py-1.5 tabular-nums">{i.row || '—'}</td>
                <td className="px-4 py-1.5 text-muted">{i.sheet ?? '—'}</td>
                <td className="px-4 py-1.5 text-muted">{i.field ? FIELD_BY_KEY.get(i.field)?.label : '—'}</td>
                <td className="px-4 py-1.5">{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function RunReconciliation() {
  const [fy, setFy] = useState(defaultFinancialYear);
  const [state, setState] = useState<{ busy: boolean; result?: RunResponse; error?: string }>({ busy: false });
  const options = [currentFinancialYear(), previousFinancialYear(currentFinancialYear()), previousFinancialYear(previousFinancialYear(currentFinancialYear()))];

  async function run() {
    setState({ busy: true });
    try {
      setState({ busy: false, result: await apiPost<RunResponse>('/api/reconciliation/run', { financialYear: fy }) });
    } catch (err) {
      setState({ busy: false, error: err instanceof ApiError ? err.message : 'Reconciliation failed' });
    }
  }

  const r = state.result;
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="text-sm font-medium">Next: reconcile against GSTR-2B</div>
          <div className="text-xs text-muted">Matches your books with what suppliers filed, and works out ITC at risk.</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Financial year</span>
          <select value={fy} onChange={(e) => setFy(e.target.value)} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm">
            {options.map((o) => (
              <option key={o} value={o}>FY {o.slice(0, 4)}–{o.slice(7)}</option>
            ))}
          </select>
        </label>
        <Button onClick={run} disabled={state.busy}>
          {state.busy ? <Spinner /> : <PlayCircle className="size-4" aria-hidden />}
          Run reconciliation
        </Button>
      </div>
      {state.error && <div className="mt-3"><Alert tone="danger" title="Could not run reconciliation">{state.error}</Alert></div>}
      {r && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Matched exactly" value={formatCount(r.summary.exactMatches)} tone="success" hint={`of ${formatCount(r.summary.totalPr)} invoices in your books`} />
          <Stat label="Need attention" value={formatCount(r.summary.mismatches)} tone="warning" />
          <Stat label="ITC at risk" value={formatInr(r.summary.totalItcAtRisk)} tone="danger" />
          <Stat label="Vendors to remind" value={formatCount(r.dunningEligibleVendors)} hint="₹5,000+ recoverable" />
        </div>
      )}
      {r && r.summary.total2b === 0 && (
        <div className="mt-3">
          <Alert tone="warning" title="No GSTR-2B data for this year yet">Upload GSTR-2B or sync it from the portal, then run again.</Alert>
        </div>
      )}
    </div>
  );
}
