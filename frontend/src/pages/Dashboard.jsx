import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/states/Loading";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { formatINR, formatDate, STATUS_UI, MATCH_STATUS } from "@/lib/utils";
import { FilePlus, TrendingUp, AlertCircle, FileText, FileIcon, Download } from "lucide-react";
import { useActiveClient } from "@/context/ActiveClientContext";
import { listRecentRuns, listFiles, getDashboardKpis } from "@/api";

export function Dashboard() {
  const { activeClientId } = useActiveClient();
  const [kpis, setKpis] = useState(null);
  const [runs, setRuns] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      if (!activeClientId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [kpisRes, runsRes, filesRes] = await Promise.all([
          getDashboardKpis(),
          listRecentRuns(),
          listFiles(activeClientId)
        ]);
        
        setKpis(kpisRes.data || kpisRes);
        setRuns(runsRes.data?.runs || runsRes.runs || []);
        setFiles(filesRes.data?.items || filesRes.items || []);
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [activeClientId]);

  if (!activeClientId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Executive Dashboard</h2>
            <p className="text-muted-foreground">Overview of your ITC health and recent reconciliations.</p>
          </div>
        </div>
        <EmptyState 
          icon={FileText} 
          title="No Workspace Selected" 
          description="Please select or create a client workspace to view your dashboard." 
        />
      </div>
    );
  }

  if (loading) return <Loading text="Loading your financial dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!kpis) return null; // Wait for kpis to load or be set

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Executive Dashboard</h2>
          <p className="text-muted-foreground">Overview of your ITC health and recent reconciliations.</p>
        </div>
        <Button asChild>
          <Link to="/runs/new">
            <FilePlus className="mr-2 h-4 w-4" />
            New Reconciliation
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total ITC (Books)</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatINR(kpis?.totalItcAvailable || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Based on purchase register</p>
          </CardContent>
        </Card>
        
        <Card className="border-status-matched/50 bg-status-matched/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-status-matched">Safe to Claim</CardTitle>
            <TrendingUp className="h-4 w-4 text-status-matched" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-status-matched">{formatINR(kpis?.safeToClaim || 0)}</div>
            <p className="text-xs text-status-matched/80 mt-1">Perfect matches in GSTR-2B</p>
          </CardContent>
        </Card>

        <Card className="border-status-missing/50 bg-status-missing/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-status-missing">Capital at Risk</CardTitle>
            <AlertCircle className="h-4 w-4 text-status-missing" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-status-missing">{formatINR(kpis?.atRisk || 0)}</div>
            <p className="text-xs text-status-missing/80 mt-1">Mismatched or missing in portal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendors Action Needed</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{kpis?.vendorsActionRequired || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Suppliers requiring follow-up</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Reconciliations</CardTitle>
            <CardDescription>Your latest tax period runs</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <EmptyState title="No runs yet" description="Start your first reconciliation to see data here." />
            ) : (
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Period</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Records</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Status</th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {runs.map((run) => (
                      <tr key={run.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle font-medium">{run.tax_period}</td>
                        <td className="p-4 align-middle text-center">{run.total_records || '-'}</td>
                        <td className="p-4 align-middle text-center capitalize">{run.status}</td>
                        <td className="p-4 align-middle text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/runs/${run.id}`}>View Results</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
            <CardDescription>Files you have uploaded for this client</CardDescription>
          </CardHeader>
          <CardContent>
            {files.length === 0 ? (
              <EmptyState title="No files yet" description="Upload PR and 2B files to see them here." />
            ) : (
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Filename</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Rows</th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {files.map((file) => (
                      <tr key={file.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle font-medium flex items-center">
                          <FileIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span className="truncate max-w-[120px]" title={file.filename}>{file.filename}</span>
                        </td>
                        <td className="p-4 align-middle text-xs text-muted-foreground">{file.kind}</td>
                        <td className="p-4 align-middle text-center">{file.row_count}</td>
                        <td className="p-4 align-middle text-right text-muted-foreground text-xs">{formatDate(file.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
