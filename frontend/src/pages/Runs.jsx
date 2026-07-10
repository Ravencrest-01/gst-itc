import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { useActiveClient } from '../context/ActiveClientContext';
import * as runsApi from '../api/runs';
import { PageHeader } from '../components/data/PageHeader';
import { ClientTabs } from '../components/data/ClientTabs';
import { Loading, ErrorState, Empty } from '../components/states/States';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../lib/format';

export default function Runs() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeClient, setActive } = useActiveClient();
  const toast = useToast();

  useEffect(() => {
    if (id && activeClient?.id !== id) {
      setActive(id);
    }
  }, [id, activeClient, setActive]);

  const { data: runsData, loading, error, reload } = useAsync(() => runsApi.list(id), true, [id]);
  const runs = runsData?.items || [];

  const [deleteId, setDeleteId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await runsApi.remove(deleteId);
      toast.success('Reconciliation deleted');
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to delete reconciliation');
    } finally {
      setSubmitting(false);
      setDeleteId(null);
    }
  };

  const getStatusTone = (status) => {
    switch (status) {
      case 'completed': return 'matched';
      case 'failed': return 'risk';
      default: return 'attention';
    }
  };

  if (loading && !runsData) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Reconciliations"
        title={activeClient?.legal_name || 'Loading...'}
        crumbs={[{ label: 'Companies', path: '/clients' }, { label: activeClient?.legal_name || 'Company', path: `/clients/${id}` }, { label: 'Reconciliations' }]}
        actions={
          <Button variant="primary" onClick={() => navigate(`/clients/${id}/runs/new`)}>
            <span className="material-symbols-outlined mr-2">add</span>
            New reconciliation
          </Button>
        }
      />

      <ClientTabs id={id} />

      <Card>
        <CardBody flush>
          {runs.length === 0 ? (
            <Empty 
              icon="sync_alt" 
              title="No reconciliations" 
              message="Run your first reconciliation to match PR and GSTR-2B data."
              action={<Button variant="primary" onClick={() => navigate(`/clients/${id}/runs/new`)}>Start reconciliation</Button>}
            />
          ) : (
            <table className="w-full text-sm ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Period</th>
                  <th>Total PR Val</th>
                  <th>Total 2B Val</th>
                  <th>Match Rate</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="group">
                    <td 
                      className="font-medium text-foreground cursor-pointer"
                      onClick={() => navigate(`/runs/${run.id}`)}
                    >
                      {new Date(run.created_on || run.created_at).toLocaleDateString()}
                    </td>
                    <td>{run.financial_year} • {run.tax_period || 'All'}</td>
                    <td className="mono-tabular">{formatMoney(run.pr_total)}</td>
                    <td className="mono-tabular">{formatMoney(run.gstr2b_total)}</td>
                    <td className="mono-tabular">{run.match_rate || 0}%</td>
                    <td>
                      <Badge tone={getStatusTone(run.status)}>{run.status}</Badge>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          className="text-muted-foreground hover:text-accent p-1"
                          onClick={() => navigate(`/runs/${run.id}`)}
                          title="View Results"
                        >
                          <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                        </button>
                        <button 
                          className="text-muted-foreground hover:text-destructive p-1"
                          onClick={() => setDeleteId(run.id)}
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        danger
        title="Delete reconciliation?"
        message="Are you sure you want to delete this reconciliation run? The associated results and manual reviews will be permanently removed."
        busy={submitting}
      />
    </div>
  );
}
