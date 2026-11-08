'use client';

import type { RowSelectionState } from '@tanstack/react-table';
import { ArrowLeft, Download, Search, Send, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MatchStatus } from '@/lib/reconciliation/types';
import { apiGet, ApiError } from '@/lib/ui/api';
import { formatCount, formatDateTime, formatInr } from '@/lib/ui/format';
import { formatIsoDate, STATUS_META, STATUS_ORDER } from '@/lib/ui/status';
import { Alert, Button, Card, cx, Stat } from '@/components/ui';
import { DetailDrawer } from './detail-drawer';
import { ReminderDialog, type SelectedVendor } from './reminder-dialog';
import { ResultsTable } from './results-table';
import type { Run } from './runs-list';
import { filtersToQuery, useResults, type ResultFilters, type ResultRow } from './use-results';

interface RunDetail extends Run {
  breakdown: { status: MatchStatus; count: number; itcAtRisk: number; itcOpportunity: number }[];
}

const ALL_STATUSES = new Set<string>(STATUS_ORDER);

function readFilters(params: URLSearchParams): ResultFilters {
  return {
    status: (params.get('status') ?? '').split(',').filter((s): s is MatchStatus => ALL_STATUSES.has(s)),
    q: params.get('q') ?? '',
    risk164: params.get('risk164') === 'true',
    sort: params.get('sort') ?? '-itcAtRisk',
  };
}

export function Workbench({ runId }: { runId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => readFilters(new URLSearchParams(params.toString())), [params]);

  const [run, setRun] = useState<RunDetail | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.q);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = useState<Map<string, ResultRow>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);

  const results = useResults(runId, filters);

  const loadRun = useCallback(async () => {
    try {
      const { run } = await apiGet<{ run: RunDetail }>(`/api/reconciliation/${runId}`);
      setRun(run);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Could not load this run');
    }
  }, [runId]);
  useEffect(() => void loadRun(), [loadRun]);

  const setFilters = useCallback(
    (next: Partial<ResultFilters>) => {
      const q = filtersToQuery({ ...filters, ...next });
      if (q.get('sort') === '-itcAtRisk') q.delete('sort');
      router.replace(`${pathname}${q.size ? `?${q}` : ''}`, { scroll: false });
      setSelection({});
      setSelectedRows(new Map());
    },
    [filters, pathname, router],
  );

  // Debounce the search box into the URL.
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => setFilters({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search, filters.q, setFilters]);

  const onSelectionChange = useCallback(
    (next: RowSelectionState) => {
      setSelection(next);
      setSelectedRows((prev) => {
        const map = new Map<string, ResultRow>();
        for (const id of Object.keys(next)) {
          if (!next[id]) continue;
          const row = prev.get(id) ?? results.rows.find((r) => r.id === id);
          if (row) map.set(id, row);
        }
        return map;
      });
    },
    [results.rows],
  );

  const selectedVendors = useMemo<SelectedVendor[]>(() => {
    const by = new Map<string, SelectedVendor>();
    for (const r of selectedRows.values()) {
      if (!r.vendorId) continue;
      const v = by.get(r.vendorId) ?? { id: r.vendorId, name: r.vendorName ?? r.supplierGstin, gstin: r.supplierGstin, invoices: 0, atRisk: 0 };
      v.invoices++;
      v.atRisk += r.itcAtRisk;
      by.set(r.vendorId, v);
    }
    return [...by.values()].sort((a, b) => b.atRisk - a.atRisk);
  }, [selectedRows]);
  const selectedAtRisk = [...selectedRows.values()].reduce((n, r) => n + r.itcAtRisk, 0);

  async function override(row: ResultRow, status: MatchStatus | null, note: string) {
    const res = await fetch(`/api/reconciliation/results/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, note }),
    });
    const body = await res.json();
    if (!res.ok) throw new ApiError(res.status, body.error ?? 'Could not save', body.details);
    results.updateRow(body.result as ResultRow);
    void loadRun();
  }

  const counts = useMemo(() => new Map(run?.breakdown.map((b) => [b.status, b.count]) ?? []), [run]);
  const total = run?.breakdown.reduce((n, b) => n + b.count, 0) ?? 0;
  const atRisk = run?.breakdown.reduce((n, b) => n + b.itcAtRisk, 0) ?? 0;
  const opportunity = run?.breakdown.reduce((n, b) => n + b.itcOpportunity, 0) ?? 0;
  const needAttention = total - (counts.get('EXACT_MATCH') ?? 0);
  const activeRow = results.rows.find((r) => r.id === activeId) ?? null;
  const exportQuery = filtersToQuery(filters);

  if (runError) {
    return (
      <div className="space-y-4">
        <Alert tone="danger" title="Could not open this run">{runError}</Alert>
        <Link href="/reconciliation" className="text-sm font-medium text-accent hover:underline">Back to runs</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/reconciliation" className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <ArrowLeft className="size-3" aria-hidden /> All runs
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reconciliation workbench{run && <span className="text-muted"> · FY {run.financialYear.slice(0, 4)}–{run.financialYear.slice(7)}</span>}
          </h1>
          {run && <p className="mt-1 text-sm text-muted">Run {formatDateTime(run.runDate)} · Section 16(4) clock as of {formatIsoDate(run.asOfDate)}</p>}
        </div>
        <div className="flex gap-2">
          <a href={`/api/reconciliation/${runId}/export?${exportQuery}&format=csv`} download>
            <Button variant="secondary" size="sm" tabIndex={-1}><Download className="size-3.5" aria-hidden />CSV</Button>
          </a>
          <a href={`/api/reconciliation/${runId}/export?${exportQuery}&format=xlsx`} download>
            <Button variant="secondary" size="sm" tabIndex={-1}><Download className="size-3.5" aria-hidden />Excel</Button>
          </a>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoices reconciled" value={run ? formatCount(total) : '…'} hint={run ? `${formatCount(counts.get('EXACT_MATCH') ?? 0)} exact matches` : undefined} />
        <Stat label="Need attention" value={run ? formatCount(needAttention) : '…'} tone="warning" />
        <Stat label="ITC at risk" value={run ? formatInr(atRisk) : '…'} tone="danger" hint="after manual changes" />
        <Stat label="Claimable, not booked" value={run ? formatInr(opportunity) : '…'} tone="accent" />
      </div>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-60 flex-1">
              <span className="sr-only">Search invoices, GSTINs or vendors</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice number, GSTIN or vendor…"
                className="h-9 w-full rounded-md border border-border-strong bg-surface pr-3 pl-8 text-sm"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" aria-label="Sec 16(4) risk only" className="size-4 accent-[var(--accent)]" checked={filters.risk164} onChange={(e) => setFilters({ risk164: e.target.checked })} />
              Sec 16(4) risk only
            </label>
            <span className="ml-auto text-xs text-muted tabular-nums" aria-live="polite">
              {results.total === null ? 'Loading…' : `${formatCount(results.total)} invoices${results.totals ? ` · ${formatInr(results.totals.itcAtRisk)} at risk` : ''}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            <Chip active={!filters.status.length} onClick={() => setFilters({ status: [] })} label="All" count={total} />
            {STATUS_ORDER.filter((s) => counts.get(s)).map((s) => {
              const active = filters.status.includes(s);
              return (
                <Chip
                  key={s}
                  active={active}
                  tone={STATUS_META[s].tone}
                  label={STATUS_META[s].label}
                  count={counts.get(s) ?? 0}
                  onClick={() => setFilters({ status: active ? filters.status.filter((x) => x !== s) : [...filters.status, s] })}
                />
              );
            })}
          </div>
        </div>

        {results.error ? (
          <div className="p-4"><Alert tone="danger" title="Could not load invoices">{results.error}</Alert></div>
        ) : (
          <ResultsTable
            rows={results.rows}
            total={results.total}
            loading={results.loading}
            hasMore={results.hasMore}
            onLoadMore={results.loadMore}
            sort={filters.sort}
            onSortChange={(sort) => setFilters({ sort })}
            selection={selection}
            onSelectionChange={onSelectionChange}
            onOpen={(r) => setActiveId(r.id)}
            activeId={activeId}
          />
        )}

        <div
          className={cx(
            'flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-sm',
            selectedRows.size ? 'bg-accent-soft' : 'bg-surface-2 text-muted',
          )}
        >
          {selectedRows.size ? (
            <>
              <span>
                <span className="font-medium">{formatCount(selectedRows.size)} selected</span> · {formatInr(selectedAtRisk)} at risk · {selectedVendors.length} vendor
                {selectedVendors.length === 1 ? '' : 's'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onSelectionChange({})}><X className="size-3.5" aria-hidden />Clear</Button>
              <Button size="sm" className="ml-auto" onClick={() => setReminding(true)} disabled={!selectedVendors.length}>
                <Send className="size-3.5" aria-hidden />Trigger vendor reminders
              </Button>
            </>
          ) : (
            <span>Select invoices to remind their vendors. Click a row for details and manual changes.</span>
          )}
        </div>
      </Card>

      <DetailDrawer row={activeRow} onClose={() => setActiveId(null)} onOverride={override} />
      <ReminderDialog open={reminding} onClose={() => setReminding(false)} runId={runId} vendors={selectedVendors} />
    </div>
  );
}

function Chip({ active, label, count, onClick, tone }: { active: boolean; label: string; count: number; onClick: () => void; tone?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg',
      )}
      data-tone={tone}
    >
      {label}
      <span className={cx('rounded-full px-1.5 tabular-nums', active ? 'bg-accent text-accent-fg' : 'bg-surface-2')}>{formatCount(count)}</span>
    </button>
  );
}
