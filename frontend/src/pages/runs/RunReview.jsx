import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import * as runsApi from '../../api/runs';
import { PageHeader } from '../../components/data/PageHeader';
import { Loading, ErrorState, Empty } from '../../components/states/States';
import { Button } from '../../components/ui/Button';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { BucketBadge, ReviewBadge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../lib/format';

export default function RunReview() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [filter, setFilter] = useState('pending'); // pending, all

  const { data: matchesData, loading, error, reload } = useAsync(
    () => runsApi.results(runId, { bucket: 'probable' }), // Mock: just probable/mismatched for review
    true,
    [runId]
  );

  const matches = matchesData?.items || [];
  
  const displayMatches = matches.filter(m => 
    filter === 'all' || m.review_status === 'pending'
  );

  const handleReview = async (matchId, status) => {
    try {
      await runsApi.reviewMatch(runId, matchId, { review_status: status });
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  if (loading && !matchesData) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Action Needed"
        title="Review Matches"
        crumbs={[
          { label: 'Reconciliations', path: `/runs` },
          { label: 'Results', path: `/runs/${runId}` },
          { label: 'Review' }
        ]}
        actions={
          <Button variant="ghost" onClick={() => navigate(`/runs/${runId}`)}>
            <span className="material-symbols-outlined mr-2">arrow_back</span>
            Back to Results
          </Button>
        }
      />

      <div className="flex gap-2 mb-6">
        <Button 
          variant={filter === 'pending' ? 'primary' : 'ghost'} 
          size="sm"
          onClick={() => setFilter('pending')}
        >
          Pending Review
        </Button>
        <Button 
          variant={filter === 'all' ? 'primary' : 'ghost'} 
          size="sm"
          onClick={() => setFilter('all')}
        >
          All Reviewable
        </Button>
      </div>

      <div className="space-y-6">
        {displayMatches.length === 0 ? (
          <Empty 
            icon="task_alt" 
            title="All caught up!" 
            message="There are no matches that require your manual review right now."
            action={<Button variant="primary" onClick={() => navigate(`/runs/${runId}`)}>Back to Results</Button>}
          />
        ) : (
          displayMatches.map((match) => (
            <Card key={match.id}>
              <CardHead 
                title={`Vendor: ${match.pr_vendor_gstin || match.gstr2b_vendor_gstin}`} 
                actions={<BucketBadge bucket={match.bucket} />}
              />
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                  {/* PR Data */}
                  <div className="space-y-3 bg-muted/20 p-4 rounded-radius border border-border">
                    <h4 className="font-semibold text-accent flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">description</span>
                      Purchase Register
                    </h4>
                    {match.pr_invoice_number ? (
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <div className="text-muted-foreground">Invoice No:</div>
                        <div className="font-medium mono-tabular">{match.pr_invoice_number}</div>
                        
                        <div className="text-muted-foreground">Date:</div>
                        <div>{new Date(match.pr_invoice_date).toLocaleDateString()}</div>
                        
                        <div className="text-muted-foreground">Tax Value:</div>
                        <div className="font-medium mono-tabular">{formatMoney(match.pr_tax_value)}</div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Missing in Books</p>
                    )}
                  </div>

                  {/* 2B Data */}
                  <div className="space-y-3 bg-muted/20 p-4 rounded-radius border border-border">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">receipt_long</span>
                      GSTR-2B
                    </h4>
                    {match.gstr2b_invoice_number ? (
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <div className="text-muted-foreground">Invoice No:</div>
                        <div className="font-medium mono-tabular">{match.gstr2b_invoice_number}</div>
                        
                        <div className="text-muted-foreground">Date:</div>
                        <div>{new Date(match.gstr2b_invoice_date).toLocaleDateString()}</div>
                        
                        <div className="text-muted-foreground">Tax Value:</div>
                        <div className="font-medium mono-tabular">{formatMoney(match.gstr2b_tax_value)}</div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Missing in Portal</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    {match.review_status !== 'pending' && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Current Status:</span>
                        <ReviewBadge status={match.review_status} />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      variant="ghost" 
                      onClick={() => handleReview(match.id, 'skipped')}
                    >
                      Skip
                    </Button>
                    <Button 
                      variant="danger" 
                      onClick={() => handleReview(match.id, 'rejected')}
                    >
                      Reject Match
                    </Button>
                    <Button 
                      variant="primary" 
                      onClick={() => handleReview(match.id, 'confirmed')}
                    >
                      Confirm Match
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
