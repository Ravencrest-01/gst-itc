import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { useActiveClient } from '../context/ActiveClientContext';
import * as workspaceApi from '../api/workspace';
import * as runsApi from '../api/runs';
import { PageHeader } from '../components/data/PageHeader';
import { Kpi } from '../components/data/Kpi';
import { Button } from '../components/ui/Button';
import { Loading, ErrorState, Empty } from '../components/states/States';
import { Card, CardHead, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatMoney } from '../lib/format';

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeId } = useActiveClient();

  const { data: kpis, loading: kpiLoading, error: kpiError, reload: kpiReload } = useAsync(workspaceApi.dashboardKpis);
  const { data: recentRunsData, loading: runsLoading, error: runsError, reload: runsReload } = useAsync(runsApi.recent);

  const recentRuns = recentRunsData?.items || [];

  const handleNewRun = () => {
    if (activeId) {
      navigate(`/clients/${activeId}/runs/new`);
    } else {
      navigate('/clients');
    }
  };

  const isLoading = kpiLoading || runsLoading;
  const isError = kpiError || runsError;

  if (isLoading) return <Loading />;
  
  if (isError) return (
    <ErrorState 
      error={kpiError || runsError} 
      onRetry={() => { kpiReload(); runsReload(); }} 
    />
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your practice and recent activities."
        actions={
          <Button variant="primary" onClick={handleNewRun}>
            <span className="material-symbols-outlined mr-2">add</span>
            New reconciliation
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Kpi 
          label="Companies" 
          value={kpis?.companies || 0} 
          accent="neutral" 
        />
        <Kpi 
          label="Open Runs" 
          value={kpis?.open_runs || 0} 
          accent="blue" 
        />
        <Kpi 
          label="ITC at Risk" 
          value={formatMoney(kpis?.itc_at_risk || 0)} 
          accent="risk" 
        />
        <Kpi 
          label="Match Rate" 
          value={`${kpis?.match_rate || 0}%`} 
          accent="matched" 
        />
      </div>

      <Card>
        <CardHead 
          title="Recent Reconciliations" 
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/runs')}>
              View all
            </Button>
          }
        />
        <CardBody flush>
          {recentRuns.length === 0 ? (
            <Empty 
              icon="sync_alt" 
              title="No recent reconciliations" 
              message="Start a new reconciliation to see the results here."
              action={<Button variant="primary" onClick={handleNewRun}>Start now</Button>}
            />
          ) : (
            <table className="w-full text-sm ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="text-right">ITC at Risk</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr 
                    key={run.id} 
                    onClick={() => navigate(`/runs/${run.id}`)}
                    className="cursor-pointer"
                  >
                    <td>{new Date(run.created_on).toLocaleDateString()}</td>
                    <td className="font-medium text-foreground">{run.client_name}</td>
                    <td>{run.financial_year} • {run.tax_period}</td>
                    <td>
                      <Badge tone={run.status === 'completed' ? 'matched' : 'neutral'}>
                        {run.status}
                      </Badge>
                    </td>
                    <td className="text-right mono-tabular">{formatMoney(run.itc_at_risk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
