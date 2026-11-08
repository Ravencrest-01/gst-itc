'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchStatus, RiskTier } from '@/lib/reconciliation/types';
import { apiGet, ApiError } from '@/lib/ui/api';

/** One row of GET /api/reconciliation/:id/results. */
export interface ResultRow {
  id: string;
  status: MatchStatus;
  matchStatus: MatchStatus;
  overrideStatus: MatchStatus | null;
  matchPass: number;
  confidence: number;
  vendorId: string | null;
  vendorName: string | null;
  supplierGstin: string;
  financialYear: string;
  prInvoiceId: string | null;
  prInvoiceNumber: string | null;
  prInvoiceDate: string | null;
  prDocumentType: string | null;
  prTaxableValue: number | null;
  prTotalTax: number | null;
  gstr2bInvoiceId: string | null;
  gstr2bInvoiceNumber: string | null;
  gstr2bInvoiceDate: string | null;
  gstr2bTaxableValue: number | null;
  gstr2bTotalTax: number | null;
  gstr2bReturnPeriod: string | null;
  gstr2bSupplierGstin: string | null;
  taxableDifference: number;
  taxDifference: number;
  itcAtRisk: number;
  originalItcAtRisk: number;
  itcOpportunity: number;
  isSection164Risk: boolean;
  isItcLapsed: boolean;
  section164Deadline: string;
  riskTier: RiskTier;
  notes: string | null;
  overrideByUserId: string | null;
  overriddenAt: string | null;
}

export interface ResultFilters {
  status: MatchStatus[];
  q: string;
  risk164: boolean;
  sort: string;
}

interface Page {
  rows: ResultRow[];
  total: number;
  totals: { itcAtRisk: number; itcOpportunity: number; section164Risk: number };
}

export const PAGE_SIZE = 200;

export function filtersToQuery(f: ResultFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status.length) p.set('status', f.status.join(','));
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.risk164) p.set('risk164', 'true');
  if (f.sort) p.set('sort', f.sort);
  return p;
}

/**
 * Loads results page by page for the current filters. Changing filters cancels any
 * request in flight and starts again from page 1.
 */
export function useResults(runId: string, filters: ResultFilters) {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [totals, setTotals] = useState<Page['totals'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const key = `${runId}?${filtersToQuery(filters).toString()}`;

  const fetchPage = useCallback(
    async (page: number, replace: boolean) => {
      if (!replace && loadingRef.current) return;
      if (replace) ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      const q = filtersToQuery(filters);
      q.set('page', String(page));
      q.set('pageSize', String(PAGE_SIZE));
      try {
        const data = await apiGet<Page>(`/api/reconciliation/${runId}/results?${q}`, c.signal);
        setRows((prev) => (replace ? data.rows : [...prev, ...data.rows]));
        setTotal(data.total);
        setTotals(data.totals);
      } catch (err) {
        if (c.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : 'Could not load results');
      } finally {
        if (ctrl.current === c) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    setRows([]);
    setTotal(null);
    void fetchPage(1, true);
    return () => ctrl.current?.abort();
  }, [fetchPage]);

  const hasMore = total !== null && rows.length < total;
  const loadMore = useCallback(() => {
    if (hasMore && !loadingRef.current) void fetchPage(Math.floor(rows.length / PAGE_SIZE) + 1, false);
  }, [hasMore, rows.length, fetchPage]);

  /** Replace one row in place (after an override) without refetching the list. */
  const updateRow = useCallback((row: ResultRow) => setRows((prev) => prev.map((r) => (r.id === row.id ? row : r))), []);
  const reload = useCallback(() => void fetchPage(1, true), [fetchPage]);

  return { rows, total, totals, loading, error, hasMore, loadMore, updateRow, reload };
}
