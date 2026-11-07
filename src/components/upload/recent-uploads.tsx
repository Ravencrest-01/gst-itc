'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, ApiError } from '@/lib/ui/api';
import { formatCount, formatDateTime } from '@/lib/ui/format';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { SOURCE_LABEL, type Source } from './types';

interface Batch {
  id: string;
  source: Source;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  rowCount: number;
  insertedCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
  createdAt: string;
}

const STATUS_TONE = { COMPLETED: 'success', FAILED: 'danger', PROCESSING: 'info', PENDING: 'neutral' } as const;

export function RecentUploads({ refreshKey }: { refreshKey: number }) {
  const [state, setState] = useState<{ batches?: Batch[]; error?: string; loading: boolean }>({ loading: true });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const { batches } = await apiGet<{ batches: Batch[] }>('/api/ingestion?limit=10', signal);
      setState({ batches, loading: false });
    } catch (err) {
      if (signal?.aborted) return;
      setState({ loading: false, error: err instanceof ApiError ? err.message : 'Could not load uploads' });
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  return (
    <Card>
      <CardHeader
        title="Recent uploads"
        action={
          <Button variant="ghost" size="sm" onClick={() => load()} aria-label="Refresh recent uploads">
            <RefreshCw className={`size-3.5 ${state.loading ? 'animate-spin' : ''}`} aria-hidden />
          </Button>
        }
      />
      {state.error ? (
        <p className="px-5 py-6 text-sm text-danger">{state.error}</p>
      ) : !state.batches ? (
        <p className="px-5 py-6 text-sm text-muted">Loading…</p>
      ) : !state.batches.length ? (
        <p className="px-5 py-6 text-sm text-muted">No uploads yet. Your files will be listed here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-5 py-2 font-medium">File</th>
                <th scope="col" className="px-3 py-2 font-medium">Type</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Saved</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Errors</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {state.batches.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="max-w-64 truncate px-5 py-2.5 font-medium" title={b.fileName}>{b.fileName}</td>
                  <td className="px-3 py-2.5 text-muted">{SOURCE_LABEL[b.source]}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={STATUS_TONE[b.status]}>{b.status.toLowerCase()}</Badge>
                    {b.status === 'FAILED' && b.errors[0] && (
                      <div className="mt-1 max-w-72 truncate text-xs text-danger" title={b.errors.at(-1)?.message}>
                        {b.errors.at(-1)?.message}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(b.insertedCount)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${b.errorCount ? 'text-danger' : 'text-muted'}`}>{formatCount(b.errorCount)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right text-muted">{formatDateTime(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
