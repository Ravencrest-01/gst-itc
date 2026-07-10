import React, { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import * as runsApi from '../../api/runs';
import { Loading, ErrorState, Empty } from '../../components/states/States';
import { BucketBadge, ReviewBadge } from '../../components/ui/Badge';
import { Field, Select, Input } from '../../components/ui/Field';
import { formatMoney } from '../../lib/format';

export default function RunResultsMatches({ runId }) {
  const [bucketFilter, setBucketFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: matchesData, loading, error, reload } = useAsync(
    () => runsApi.results(runId, { 
      bucket: bucketFilter || undefined,
      search: search || undefined
    }),
    true,
    [runId, bucketFilter, search]
  );

  const matches = matchesData?.items || [];

  if (loading && !matchesData) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-radius border border-border">
        <Field className="sm:w-1/3">
          <Input 
            placeholder="Search invoice number..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field className="sm:w-1/4">
          <Select value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value)}>
            <option value="">All Buckets</option>
            <option value="matched">Matched</option>
            <option value="probable">Probable</option>
            <option value="mismatched">Mismatched</option>
            <option value="missing_in_portal">Missing in Portal</option>
            <option value="missing_in_books">Missing in Books</option>
          </Select>
        </Field>
      </div>

      <div className="bg-card rounded-radius border border-border overflow-hidden">
        {matches.length === 0 ? (
          <Empty title="No matches found" message="Try adjusting your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm ledger-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Vendor GSTIN</th>
                  <th>Invoice No</th>
                  <th>Date</th>
                  <th className="text-right">PR Tax Val</th>
                  <th className="text-right">2B Tax Val</th>
                  <th className="text-right">Diff</th>
                  <th>Bucket</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const hasPr = !!match.pr_invoice_number;
                  const has2b = !!match.gstr2b_invoice_number;
                  
                  return (
                    <tr key={match.id}>
                      <td className="mono-tabular">
                        {match.pr_vendor_gstin || match.gstr2b_vendor_gstin}
                      </td>
                      <td className="mono-tabular">
                        {hasPr ? match.pr_invoice_number : match.gstr2b_invoice_number}
                        {hasPr && has2b && match.pr_invoice_number !== match.gstr2b_invoice_number && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            2B: {match.gstr2b_invoice_number}
                          </div>
                        )}
                      </td>
                      <td>
                        {hasPr ? new Date(match.pr_invoice_date).toLocaleDateString() : new Date(match.gstr2b_invoice_date).toLocaleDateString()}
                      </td>
                      <td className="text-right mono-tabular">
                        {hasPr ? formatMoney(match.pr_tax_value) : '-'}
                      </td>
                      <td className="text-right mono-tabular">
                        {has2b ? formatMoney(match.gstr2b_tax_value) : '-'}
                      </td>
                      <td className="text-right mono-tabular font-medium text-destructive">
                        {match.difference !== null ? formatMoney(match.difference) : '-'}
                      </td>
                      <td><BucketBadge bucket={match.bucket} /></td>
                      <td><ReviewBadge status={match.review_status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
