import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import * as runsApi from '../../api/runs';
import { PageHeader } from '../../components/data/PageHeader';
import { Loading, ErrorState } from '../../components/states/States';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import RunResultsSummary from './RunResultsSummary';
import RunResultsMatches from './RunResultsMatches';

export default function RunResults() {
  const { runId } = useParams();
  const navigate = useNavigate();

  const { data: summary, loading, error, reload } = useAsync(() => runsApi.summary(runId), true, [runId]);
  
  const [activeTab, setActiveTab] = useState('summary');

  const getStatusTone = (status) => {
    switch (status) {
      case 'completed': return 'matched';
      case 'failed': return 'risk';
      default: return 'attention';
    }
  };

  if (loading && !summary) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!summary) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Reconciliation Results"
        title={`${summary.financial_year} ${summary.tax_period ? `• ${summary.tax_period}` : ''}`}
        crumbs={[
          { label: 'Companies', path: '/clients' },
          { label: 'Company', path: `/clients/${summary.client_id}` },
          { label: 'Reconciliations', path: `/clients/${summary.client_id}/runs` },
          { label: 'Results' }
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={getStatusTone(summary.status)} className="px-3 py-1 text-sm">
              {summary.status === 'completed' ? 'Done' : summary.status}
            </Badge>
            <Button variant="ghost" onClick={() => navigate(`/runs/${runId}/review`)}>
              <span className="material-symbols-outlined mr-2">checklist</span>
              Action needed
            </Button>
            <Button variant="primary" onClick={() => navigate('/reports')}>
              <span className="material-symbols-outlined mr-2">download</span>
              Export Reports
            </Button>
          </div>
        }
      />

      <div className="border-b border-border mb-6 flex overflow-x-auto">
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'summary' 
              ? 'border-accent text-accent' 
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          Summary
        </button>
        <button
          onClick={() => setActiveTab('matches')}
          className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'matches' 
              ? 'border-accent text-accent' 
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          Detailed Matches
        </button>
      </div>

      {activeTab === 'summary' ? (
        <RunResultsSummary summary={summary} />
      ) : (
        <RunResultsMatches runId={runId} />
      )}
    </div>
  );
}
