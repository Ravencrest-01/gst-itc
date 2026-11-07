'use client';

import { CloudDownload } from 'lucide-react';
import { useState } from 'react';
import { apiPost, ApiError } from '@/lib/ui/api';
import { currentFinancialYear, formatCount, previousFinancialYear } from '@/lib/ui/format';
import { Alert, Button, Spinner } from '@/components/ui';
import { defaultFinancialYear, RunReconciliation } from './upload-result';

interface SyncResponse {
  provider: string;
  written: number;
  failed: number;
  periods: { returnPeriod: string; written: number; error?: string }[];
}

/** Pull GSTR-2B for a whole financial year from the (mock) GSP instead of uploading files. */
export function Gstr2bSync({ onDone }: { onDone: () => void }) {
  const [fy, setFy] = useState(defaultFinancialYear);
  const [state, setState] = useState<{ busy: boolean; result?: SyncResponse; error?: string }>({ busy: false });
  const current = currentFinancialYear();
  const options = [current, previousFinancialYear(current)];

  async function sync() {
    setState({ busy: true });
    try {
      const result = await apiPost<SyncResponse>('/api/gstr2b/sync', { financialYear: fy });
      setState({ busy: false, result });
      onDone();
    } catch (err) {
      setState({ busy: false, error: err instanceof ApiError ? err.message : 'Sync failed' });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CloudDownload className="size-4 text-muted" aria-hidden />
            No file? Fetch GSTR-2B from the GST portal
          </div>
          <div className="mt-0.5 text-xs text-muted">
            Uses a simulated portal until GSP access is set up: statements are built from your purchase register.
          </div>
        </div>
        <select aria-label="Financial year to fetch" value={fy} onChange={(e) => setFy(e.target.value)} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm">
          {options.map((o) => (
            <option key={o} value={o}>FY {o.slice(0, 4)}–{o.slice(7)}</option>
          ))}
        </select>
        <Button variant="secondary" onClick={sync} disabled={state.busy}>
          {state.busy && <Spinner />}
          Fetch 12 months
        </Button>
      </div>
      {state.error && <div className="mt-3"><Alert tone="danger" title="Could not fetch GSTR-2B">{state.error}</Alert></div>}
      {state.result && (
        <div className="mt-3">
          <Alert tone={state.result.failed ? 'warning' : 'success'} title={`Fetched ${formatCount(state.result.written)} documents over ${state.result.periods.length} months`}>
            {state.result.failed
              ? `${state.result.failed} month(s) failed: ${state.result.periods.filter((p) => p.error).map((p) => p.returnPeriod).join(', ')}`
              : 'Saved.'}
          </Alert>
          <div className="mt-3">
            <RunReconciliation />
          </div>
        </div>
      )}
    </div>
  );
}
