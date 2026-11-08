'use client';

import { ArrowRight, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '@/lib/ui/api';
import { currentFinancialYear, formatCount, formatDateTime, formatInr, previousFinancialYear } from '@/lib/ui/format';
import { formatIsoDate } from '@/lib/ui/status';
import { Alert, Badge, Button, Card, CardHeader, Spinner } from '@/components/ui';
import { defaultFinancialYear } from '@/components/upload/upload-result';

export interface Run {
  id: string;
  financialYear: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  asOfDate: string;
  runDate: string;
  totalPrCount: number;
  total2bCount: number;
  exactMatchesCount: number;
  mismatchesCount: number;
  totalItcAtRisk: number;
  totalItcOpportunity: number;
  section164RiskAmount: number;
}

const fyLabel = (fy: string) => `FY ${fy.slice(0, 4)}–${fy.slice(7)}`;

export function RunsList() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fy, setFy] = useState(defaultFinancialYear);
  const [running, setRunning] = useState(false);
  const current = currentFinancialYear();
  const fyOptions = [current, previousFinancialYear(current), previousFinancialYear(previousFinancialYear(current))];

  useEffect(() => {
    const ctrl = new AbortController();
    apiGet<{ runs: Run[] }>('/api/reconciliation/runs?limit=50', ctrl.signal)
      .then((r) => setRuns(r.runs))
      .catch((err) => !ctrl.signal.aborted && setError(err instanceof ApiError ? err.message : 'Could not load runs'));
    return () => ctrl.abort();
  }, []);

  async function newRun() {
    setRunning(true);
    setError(null);
    try {
      const { runId } = await apiPost<{ runId: string }>('/api/reconciliation/run', { financialYear: fy });
      router.push(`/reconciliation/${runId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reconciliation failed');
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Each run matches your books against GSTR-2B for one financial year. Open a run to review and act on mismatches.</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Financial year" value={fy} onChange={(e) => setFy(e.target.value)} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm">
            {fyOptions.map((o) => <option key={o} value={o}>{fyLabel(o)}</option>)}
          </select>
          <Button onClick={newRun} disabled={running}>
            {running ? <Spinner /> : <PlayCircle className="size-4" aria-hidden />}
            New run
          </Button>
        </div>
      </header>

      {error && <Alert tone="danger" title="Something went wrong">{error}</Alert>}

      <Card>
        <CardHeader title="Runs" description="Newest first. Re-run after uploading new data; each run is kept for audit." />
        {!runs && !error ? (
          <p className="px-5 py-8 text-sm text-muted">Loading…</p>
        ) : runs && !runs.length ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium">No reconciliation runs yet</p>
            <p className="mt-1 text-sm text-muted">Upload your purchase register and GSTR-2B, then run one for the year.</p>
            <Link href="/upload" className="mt-4 inline-flex text-sm font-medium text-accent hover:underline">Go to upload</Link>
          </div>
        ) : runs ? (
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/reconciliation/${r.id}`} className="group grid gap-3 px-5 py-4 hover:bg-surface-2 sm:grid-cols-[1.2fr_repeat(4,1fr)_auto] sm:items-center">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {fyLabel(r.financialYear)}
                      {r.status !== 'COMPLETED' && <Badge tone={r.status === 'FAILED' ? 'danger' : 'info'}>{r.status.toLowerCase()}</Badge>}
                    </div>
                    <div className="text-xs text-muted">Run {formatDateTime(r.runDate)} · as of {formatIsoDate(r.asOfDate)}</div>
                  </div>
                  <Metric label="Invoices (books / 2B)" value={`${formatCount(r.totalPrCount)} / ${formatCount(r.total2bCount)}`} />
                  <Metric label="Exact matches" value={formatCount(r.exactMatchesCount)} />
                  <Metric label="ITC at risk" value={formatInr(r.totalItcAtRisk)} tone="text-danger" />
                  <Metric label="Sec 16(4) exposure" value={formatInr(r.section164RiskAmount)} tone="text-warning" />
                  <ArrowRight className="hidden size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  );
}
