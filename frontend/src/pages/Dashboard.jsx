import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/states/Loading";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { formatINR, formatDate, STATUS_UI, MATCH_STATUS } from "@/lib/utils";
import { getDashboardKpis, listRecentRuns } from "@/api";
import { FilePlus, TrendingUp, AlertCircle, FileText } from "lucide-react";

export function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // We'll mock API calls for now since backend might not exist, but structure it for the real API
        // const kpiData = await getDashboardKpis();
        // const runsData = await listRecentRuns();
        
        // Mock data matching the fintech aesthetic
        setKpis({
          totalItcAvailable: 4520000.50,
          safeToClaim: 3850000.00,
          atRisk: 670000.50,
          vendorsActionRequired: 12
        });
        
        setRuns([
          { id: "run_1", tax_period: "Apr 2026", status: "completed", match_stats: { matched: 450, mismatched: 12, missing_portal: 45 }, created_at: new Date().toISOString() },
          { id: "run_2", tax_period: "Mar 2026", status: "completed", match_stats: { matched: 410, mismatched: 2, missing_portal: 10 }, created_at: new Date(Date.now() - 86400000 * 30).toISOString() }
        ]);
        
        setError(null);
      } catch (err) {
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <Loading text="Loading your financial dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

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
            <div className="text-2xl font-bold tabular-nums">{formatINR(kpis.totalItcAvailable)}</div>
            <p className="text-xs text-muted-foreground mt-1">Based on purchase register</p>
          </CardContent>
        </Card>
        
        <Card className="border-status-matched/50 bg-status-matched/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-status-matched">Safe to Claim</CardTitle>
            <TrendingUp className="h-4 w-4 text-status-matched" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-status-matched">{formatINR(kpis.safeToClaim)}</div>
            <p className="text-xs text-status-matched/80 mt-1">Perfect matches in GSTR-2B</p>
          </CardContent>
        </Card>

        <Card className="border-status-missing/50 bg-status-missing/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-status-missing">Capital at Risk</CardTitle>
            <AlertCircle className="h-4 w-4 text-status-missing" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-status-missing">{formatINR(kpis.atRisk)}</div>
            <p className="text-xs text-status-missing/80 mt-1">Mismatched or missing in portal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendors Action Needed</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{kpis.vendorsActionRequired}</div>
            <p className="text-xs text-muted-foreground mt-1">Suppliers requiring follow-up</p>
          </CardContent>
        </Card>
      </div>

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
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date Run</th>
                    <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Matched</th>
                    <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Mismatched</th>
                    <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Missing</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="p-4 align-middle font-medium">{run.tax_period}</td>
                      <td className="p-4 align-middle">{formatDate(run.created_at)}</td>
                      <td className="p-4 align-middle text-center">
                        <Badge variant="outline" className={STATUS_UI[MATCH_STATUS.MATCHED].color}>
                          {run.match_stats.matched}
                        </Badge>
                      </td>
                      <td className="p-4 align-middle text-center">
                        <Badge variant="outline" className={STATUS_UI[MATCH_STATUS.MISMATCHED].color}>
                          {run.match_stats.mismatched}
                        </Badge>
                      </td>
                      <td className="p-4 align-middle text-center">
                        <Badge variant="outline" className={STATUS_UI[MATCH_STATUS.MISSING_IN_PORTAL].color}>
                          {run.match_stats.missing_portal}
                        </Badge>
                      </td>
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
    </div>
  );
}
