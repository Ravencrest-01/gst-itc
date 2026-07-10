import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Download, FileSpreadsheet } from "lucide-react";
import { getClientRuns, getRunResults } from "@/api";
import { useActiveClient } from "@/context/ActiveClientContext";
import { Loading } from "@/components/states/Loading";
import { EmptyState } from "@/components/states/EmptyState";
import { useToast } from "@/context/ToastContext";

export function Reports() {
  const { activeClientId } = useActiveClient();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    async function loadRuns() {
      if (!activeClientId) return;
      setLoading(true);
      try {
        const res = await getClientRuns(activeClientId);
        setRuns(res.data?.items || res.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadRuns();
  }, [activeClientId]);

  const downloadCSV = (data, filename) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(obj => 
      Object.values(obj).map(val => `"${val || ''}"`).join(",")
    ).join("\n");
    const csvString = `${headers}\n${rows}`;
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async (runId, bucketFilter) => {
    try {
      const res = await getRunResults(runId);
      const items = res.data?.items || res.items || [];
      const filtered = bucketFilter === 'all' ? items : items.filter(i => i.bucket === bucketFilter);
      
      if (filtered.length === 0) {
        toast({ title: "Empty Report", description: "No records found for this bucket." });
        return;
      }

      const csvData = filtered.map(i => ({
        VendorName: i.vendor_name,
        GSTIN: i.gstin,
        InvoiceNo: i.invoice_no,
        Date: i.date,
        Bucket: i.bucket,
        PR_Tax: i.pr_tax,
        Portal_Tax: i.po_tax,
        Tax_Diff: i.tax_diff
      }));

      downloadCSV(csvData, `ITC_Report_${bucketFilter}_${runId}.csv`);
      toast({ title: "Export Started", description: "Your CSV is downloading." });
    } catch (err) {
      console.error(err);
      toast({ title: "Export Failed", description: "Failed to download report.", variant: "destructive" });
    }
  };

  if (!activeClientId) return <EmptyState icon={FileSpreadsheet} title="Select Workspace" description="Select a client workspace from the top bar to view reports." />;
  if (loading) return <Loading text="Loading reports..." />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Export Reports</h2>
        <p className="text-muted-foreground">Download matched and mismatched tables to CSV or Excel for your reconciliation runs.</p>
      </div>

      {runs.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No runs found" description="You haven't run any reconciliations for this workspace yet." />
      ) : (
        <div className="space-y-4">
          {runs.map(run => (
            <Card key={run.id}>
              <CardHeader className="pb-3 border-b bg-muted/20 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Run ID: {run.id.substring(0,8)}</CardTitle>
                  <CardDescription>Period: {run.tax_period} • Status: {run.status}</CardDescription>
                </div>
                <Button variant="outline" onClick={() => handleExport(run.id, 'all')}>
                  <Download className="mr-2 h-4 w-4" /> Export All
                </Button>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button variant="outline" className="justify-start w-full text-status-matched" onClick={() => handleExport(run.id, 'matched')}>
                  Export Matched
                </Button>
                <Button variant="outline" className="justify-start w-full text-destructive" onClick={() => handleExport(run.id, 'mismatched')}>
                  Export Mismatched
                </Button>
                <Button variant="outline" className="justify-start w-full text-orange-500" onClick={() => handleExport(run.id, 'missing_in_portal')}>
                  Export Missing in 2B
                </Button>
                <Button variant="outline" className="justify-start w-full text-purple-500" onClick={() => handleExport(run.id, 'missing_in_books')}>
                  Export Missing in PR
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
