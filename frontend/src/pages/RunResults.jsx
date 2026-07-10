import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/states/Loading";
import { ErrorState } from "@/components/states/ErrorState";
import { formatINR, STATUS_UI, MATCH_STATUS } from "@/lib/utils";
import { Download, Search, Filter } from "lucide-react";
import { getRunSummary, getRunResults } from "@/api";

export function RunResults() {
  const { runId } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchData() {
      if (!runId || runId === "latest") return; // Should handle latest gracefully, maybe redirect or error out. We assume real runId here.
      setLoading(true);
      try {
        const summaryRes = await getRunSummary(runId);
        const resultsRes = await getRunResults(runId);
        
        const summaryData = summaryRes.data || summaryRes;
        const resultsData = resultsRes.data || resultsRes;
        
        // Map the results to match our expected frontend data shape
        const invoices = (resultsData.items || []).map(item => ({
            id: item.id,
            vendor_name: item.vendor_name || "Unknown Vendor",
            gstin: item.gstin || "Unknown GSTIN",
            invoice_no: item.invoice_no || "N/A",
            date: item.date || "N/A",
            tax_amount: item.pr_tax || item.po_tax || 0,
            status: item.bucket,
            tax_diff: item.tax_diff
        }));

        setData({
          period: "Selected Period", // Assuming we could fetch this from the run details if we had a getRun endpoint
          summary: {
            total_pr_value: summaryData.itc_at_risk + summaryData.itc_recovered || 0, // Mock calculation for now based on what we have
            total_2b_value: summaryData.itc_recovered || 0,
          },
          invoices: invoices
        });
      } catch (err) {
        console.error("Failed to fetch run results:", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [runId]);

  if (loading) return <Loading text="Loading reconciliation results..." />;
  if (!data) return <ErrorState message="Results not found" />;

  const filteredInvoices = data.invoices.filter(inv => {
    const matchesTab = activeTab === "all" || inv.status === activeTab;
    const matchesSearch = inv.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          inv.invoice_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inv.gstin.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const tabs = [
    { id: "all", label: "All Invoices" },
    { id: MATCH_STATUS.MATCHED, label: "Matched" },
    { id: MATCH_STATUS.MISMATCHED, label: "Mismatched" },
    { id: MATCH_STATUS.MISSING_IN_PORTAL, label: "Missing in 2B" },
    { id: MATCH_STATUS.PROBABLE, label: "Probable Matches" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reconciliation Results: {data.period}</h2>
          <p className="text-muted-foreground">Review your matched and mismatched ITC entries.</p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Report
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm text-muted-foreground">Total ITC as per Books (PR)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatINR(data.summary.total_pr_value)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm text-muted-foreground">Total ITC as per Portal (2B)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatINR(data.summary.total_2b_value)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="border-b px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map(tab => (
              <Button 
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className="whitespace-nowrap rounded-full"
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 w-full max-w-xs relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search vendor, GSTIN, invoice..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b bg-muted/50">
              <tr>
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Vendor & GSTIN</th>
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Invoice Details</th>
                <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Tax Amount</th>
                <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Status</th>
                <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {filteredInvoices.map((inv) => {
                const statusInfo = STATUS_UI[inv.status] || STATUS_UI[MATCH_STATUS.PROBABLE];
                return (
                  <tr key={inv.id} className="border-b transition-colors hover:bg-muted/30">
                    <td className="p-4 align-middle">
                      <div className="font-medium">{inv.vendor_name}</div>
                      <div className="text-xs text-muted-foreground">{inv.gstin}</div>
                    </td>
                    <td className="p-4 align-middle">
                      <div className="font-medium">{inv.invoice_no}</div>
                      <div className="text-xs text-muted-foreground">{inv.date}</div>
                    </td>
                    <td className="p-4 align-middle text-right">
                      <div className="font-medium tabular-nums">{formatINR(inv.tax_amount)}</div>
                      {inv.tax_diff && (
                        <div className="text-xs text-destructive">Diff: {formatINR(inv.tax_diff)}</div>
                      )}
                    </td>
                    <td className="p-4 align-middle text-center">
                      <Badge variant="outline" className={statusInfo.color}>
                        {statusInfo.label}
                      </Badge>
                    </td>
                    <td className="p-4 align-middle text-right">
                      <Button variant="ghost" size="sm">Details</Button>
                    </td>
                  </tr>
                );
              })}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No invoices match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
