'use client';

import {
  createColumnHelper,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, PencilLine } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { formatInr } from '@/lib/ui/format';
import { daysUntil, formatIsoDate, STATUS_META, TIER_TONE } from '@/lib/ui/status';
import { Badge, cx, Spinner } from '@/components/ui';
import type { ResultRow } from './use-results';

const features = tableFeatures({ rowSortingFeature, rowSelectionFeature });
const col = createColumnHelper<typeof features, ResultRow>();

/** Column id → server sort key. Columns not listed here are not sortable. */
const SORT_KEYS: Record<string, string> = {
  vendor: 'vendor',
  invoiceDate: 'invoiceDate',
  itcAtRisk: 'itcAtRisk',
  status: 'status',
  deadline: 'deadline',
};

export function sortToState(sort: string): SortingState {
  if (!sort) return [];
  const desc = sort.startsWith('-');
  const key = sort.replace(/^-/, '');
  const id = Object.entries(SORT_KEYS).find(([, k]) => k === key)?.[0];
  return id ? [{ id, desc }] : [];
}

export function stateToSort(state: SortingState): string {
  const s = state[0];
  return s && SORT_KEYS[s.id] ? `${s.desc ? '-' : ''}${SORT_KEYS[s.id]}` : '-itcAtRisk';
}

const ROW_HEIGHT = 56;
/** Fixed widths; Vendor takes whatever is left (at least VENDOR_MIN). */
const WIDTHS: Record<string, number> = {
  select: 36, invoice: 128, invoiceDate: 100, booksTax: 104, b2bTax: 104, itcAtRisk: 116, status: 140, deadline: 84,
};
const VENDOR_MIN = 140;

function Money({ value, muted }: { value: number | null; muted?: boolean }) {
  if (value === null || value === undefined) return <span className="text-subtle">—</span>;
  return <span className={muted ? 'text-muted' : undefined}>{formatInr(value)}</span>;
}

export function ResultsTable({
  rows,
  total,
  loading,
  hasMore,
  onLoadMore,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  onOpen,
  activeId,
}: {
  rows: ResultRow[];
  total: number | null;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  sort: string;
  onSortChange: (sort: string) => void;
  selection: RowSelectionState;
  onSelectionChange: (s: RowSelectionState) => void;
  onOpen: (row: ResultRow) => void;
  activeId: string | null;
}) {
  const columns = useMemo(
    () =>
      col.columns([
      col.display({
        id: 'select',
        enableSorting: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all loaded rows"
            className="size-4 accent-[var(--accent)]"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select invoice ${row.original.prInvoiceNumber ?? row.original.gstr2bInvoiceNumber ?? ''}`}
            className="size-4 accent-[var(--accent)]"
            checked={row.getIsSelected()}
            onClick={(e) => e.stopPropagation()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      }),
      col.accessor('vendorName', {
        id: 'vendor',
        header: 'Vendor',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium" title={row.original.vendorName ?? ''}>{row.original.vendorName ?? 'Unknown vendor'}</div>
            <div className="truncate font-mono text-xs text-muted">{row.original.supplierGstin}</div>
          </div>
        ),
      }),
      col.display({
        id: 'invoice',
        header: 'Invoice',
        enableSorting: false,
        cell: ({ row: { original: r } }) => {
          const main = r.prInvoiceNumber ?? r.gstr2bInvoiceNumber ?? '—';
          const other = r.prInvoiceNumber && r.gstr2bInvoiceNumber && r.prInvoiceNumber !== r.gstr2bInvoiceNumber ? r.gstr2bInvoiceNumber : null;
          return (
            <div className="min-w-0">
              <div className="truncate font-mono text-xs" title={main}>{main}</div>
              {other && <div className="truncate text-xs text-muted" title={`In GSTR-2B as ${other}`}>2B: {other}</div>}
              {r.prDocumentType && r.prDocumentType !== 'INVOICE' && (
                <div className="text-xs text-muted">{r.prDocumentType === 'CREDIT_NOTE' ? 'Credit note' : 'Debit note'}</div>
              )}
            </div>
          );
        },
      }),
      col.accessor((r) => r.prInvoiceDate ?? r.gstr2bInvoiceDate, {
        id: 'invoiceDate',
        header: 'Date',
        cell: ({ row: { original: r } }) => <span className="whitespace-nowrap">{formatIsoDate(r.prInvoiceDate ?? r.gstr2bInvoiceDate)}</span>,
      }),
      col.accessor('prTotalTax', {
        id: 'booksTax',
        header: 'Tax in books',
        enableSorting: false,
        cell: ({ row: { original: r } }) => <Money value={r.prTotalTax} />,
      }),
      col.accessor('gstr2bTotalTax', {
        id: 'b2bTax',
        header: 'Tax in 2B',
        enableSorting: false,
        cell: ({ row: { original: r } }) => <Money value={r.gstr2bTotalTax} muted={r.gstr2bTotalTax === r.prTotalTax} />,
      }),
      col.accessor('itcAtRisk', {
        id: 'itcAtRisk',
        header: 'ITC at risk',
        cell: ({ row: { original: r } }) => {
          if (r.isItcLapsed && (r.originalItcAtRisk > 0 || r.itcOpportunity > 0)) {
            return <span className="text-muted line-through" title="Section 16(4) deadline passed">{formatInr(r.originalItcAtRisk || r.itcOpportunity)}</span>;
          }
          if (r.itcAtRisk > 0) return <span className="font-semibold text-danger">{formatInr(r.itcAtRisk)}</span>;
          if (r.itcOpportunity > 0) return <span className="text-accent" title="Credit you can still claim">+{formatInr(r.itcOpportunity)}</span>;
          return <span className="text-subtle">—</span>;
        },
      }),
      col.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: ({ row: { original: r } }) => (
          <span className="flex items-center gap-1.5">
            <Badge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Badge>
            {r.overrideStatus && (
              <PencilLine className="size-3.5 text-muted" aria-label={`Overridden from ${STATUS_META[r.matchStatus].label}`}>
                <title>Overridden from {STATUS_META[r.matchStatus].label}</title>
              </PencilLine>
            )}
          </span>
        ),
      }),
      col.accessor('section164Deadline', {
        id: 'deadline',
        header: 'Sec 16(4)',
        cell: ({ row: { original: r } }) => {
          if (r.isItcLapsed) return <Badge tone="neutral">Lapsed</Badge>;
          if (r.itcAtRisk <= 0 && r.itcOpportunity <= 0) return <span className="text-subtle">—</span>;
          const days = daysUntil(r.section164Deadline);
          return (
            <Badge tone={r.isSection164Risk ? TIER_TONE[r.riskTier] : 'neutral'} className="tabular-nums">
              {days < 0 ? 'Lapsed' : days === 0 ? 'Today' : `${days} days`}
            </Badge>
          );
        },
      }),
      ]),
    [],
  );

  const sorting = useMemo(() => sortToState(sort), [sort]);
  const apply = <T,>(u: Updater<T>, prev: T): T => (typeof u === 'function' ? (u as (p: T) => T)(prev) : u);

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (r) => r.id,
    manualSorting: true,
    enableSortingRemoval: false,
    enableRowSelection: true,
    state: { sorting, rowSelection: selection },
    onSortingChange: (u) => onSortChange(stateToSort(apply(u, sorting))),
    onRowSelectionChange: (u) => onSelectionChange(apply(u, selection)),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length + (hasMore ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? 0;

  // Fetch the next page when the user scrolls near the end of what is loaded.
  useEffect(() => {
    if (hasMore && !loading && lastIndex >= tableRows.length - 20) onLoadMore();
  }, [lastIndex, hasMore, loading, tableRows.length, onLoadMore]);

  // Back to the top when the filters (and so the row set) change.
  useEffect(() => {
    if (!rows.length) scrollRef.current?.scrollTo({ top: 0 });
  }, [rows.length]);

  const padTop = items[0]?.start ?? 0;
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const colCount = columns.length;

  return (
    <div ref={scrollRef} className="relative h-[calc(100vh-360px)] min-h-[420px] overflow-auto" tabIndex={-1}>
      <table className="w-full table-fixed text-sm" style={{ minWidth: Object.values(WIDTHS).reduce((a, b) => a + b, 0) + VENDOR_MIN }} aria-rowcount={total ?? undefined}>
        <colgroup>
          {table.getAllLeafColumns().map((c) => <col key={c.id} style={{ width: WIDTHS[c.id] }} />)}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface-2 shadow-[0_1px_0_var(--border)]">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const canSort = h.column.getCanSort() && SORT_KEYS[h.column.id];
                const dir = h.column.getIsSorted();
                const label = <table.FlexRender header={h} />;
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={dir ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
                    className={cx('px-3 py-2.5 text-left text-xs font-medium text-muted', ['booksTax', 'b2bTax', 'itcAtRisk'].includes(h.column.id) && 'text-right')}
                  >
                    {canSort ? (
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-fg">
                        {label}
                        {dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : dir === 'desc' ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUpDown className="size-3 opacity-40" aria-hidden />}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {padTop > 0 && <tr aria-hidden style={{ height: padTop }}><td colSpan={colCount} /></tr>}
          {items.map((v) => {
            const row = tableRows[v.index];
            if (!row) {
              return (
                <tr key="loader" style={{ height: ROW_HEIGHT }}>
                  <td colSpan={colCount} className="px-5 text-sm text-muted">
                    <span className="inline-flex items-center gap-2"><Spinner /> Loading more…</span>
                  </td>
                </tr>
              );
            }
            const r = row.original;
            return (
              <tr
                key={row.id}
                aria-rowindex={v.index + 2}
                aria-selected={row.getIsSelected()}
                tabIndex={0}
                onClick={() => onOpen(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(r);
                  }
                }}
                style={{ height: ROW_HEIGHT }}
                className={cx(
                  'cursor-pointer border-b border-border outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:shadow-[inset_3px_0_0_var(--accent)]',
                  row.getIsSelected() && 'bg-accent-soft/60',
                  activeId === r.id && 'shadow-[inset_3px_0_0_var(--accent)]',
                )}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={cx('overflow-hidden px-3', ['booksTax', 'b2bTax', 'itcAtRisk'].includes(cell.column.id) && 'text-right tabular-nums')}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
          {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }}><td colSpan={colCount} /></tr>}
        </tbody>
      </table>
      {!loading && total === 0 && (
        <div className="px-5 py-12 text-center text-sm text-muted">No invoices match these filters.</div>
      )}
      {loading && !rows.length && (
        <div className="flex items-center gap-2 px-5 py-12 text-sm text-muted"><Spinner /> Loading invoices…</div>
      )}
    </div>
  );
}
