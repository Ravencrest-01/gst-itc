import React, { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { useActiveClient } from '../context/ActiveClientContext';
import * as runsApi from '../api/runs';
import * as reportsApi from '../api/reports';
import { PageHeader } from '../components/data/PageHeader';
import { Loading, ErrorState, Empty } from '../components/states/States';
import { Card, CardHead, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../context/ToastContext';

export default function Reports() {
  const { activeClient } = useActiveClient();
  const toast = useToast();

  const { data: runsData, loading, error, reload } = useAsync(() => runsApi.list(activeClient?.id), !!activeClient, [activeClient]);
  const runs = runsData?.items || [];

  const [downloading, setDownloading] = useState(null);

  const handleDownload = async (runId, reportType) => {
    setDownloading(`${runId}-${reportType}`);
    try {
      await reportsApi.downloadReport(runId, reportType);
      toast.success('Download started');
    } catch (err) {
      toast.error(err.message || 'Download failed');
    } finally {
      setDownloading(null);
    }
  };

  if (loading && !runsData) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Reports & Exports"
        subtitle="Download reconciliation reports for your companies."
      />

      <Card>
        <CardHead title={`Recent Reconciliations for ${activeClient?.legal_name || 'Selected Company'}`} />
        <CardBody flush>
          {!activeClient ? (
            <Empty 
              icon="business" 
              title="No company selected" 
              message="Select a company from the top bar to view its reports." 
            />
          ) : runs.length === 0 ? (
            <Empty 
              icon="assessment" 
              title="No reports available" 
              message="Run a reconciliation first to generate reports." 
            />
          ) : (
            <div className="space-y-4 p-6">
              {runs.map((run) => (
                <div key={run.id} className="border border-border rounded-radius p-4 flex flex-col md:flex-row items-center justify-between gap-4 bg-muted/10">
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {run.financial_year} {run.tax_period ? `• ${run.tax_period}` : ''}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Run on {new Date(run.created_on || run.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <Button 
                      variant="default" 
                      onClick={() => handleDownload(run.id, 'summary')}
                      disabled={downloading === `${run.id}-summary`}
                      className="flex-1 md:flex-none"
                    >
                      <span className="material-symbols-outlined mr-2">description</span>
                      Summary PDF
                    </Button>
                    <Button 
                      variant="primary" 
                      onClick={() => handleDownload(run.id, 'tally')}
                      disabled={downloading === `${run.id}-tally`}
                      className="flex-1 md:flex-none"
                    >
                      <span className="material-symbols-outlined mr-2">table_view</span>
                      Tally Excel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
