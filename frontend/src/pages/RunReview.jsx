import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Check, X, AlertTriangle } from "lucide-react";
import { formatINR } from "@/lib/utils";

export function RunReview() {
  const [loading, setLoading] = useState(false);
  const [probableMatches, setProbableMatches] = useState([
    {
      id: "match_1",
      confidence: 85,
      pr_record: { vendor: "Tech Solutions", gstin: "29AABCT1234Q1Z1", invoice_no: "TS-26-042", date: "2026-04-12", tax: 54000 },
      portal_record: { vendor: "Tech Solutions Pvt Ltd", gstin: "29AABCT1234Q1Z1", invoice_no: "TS/26/042", date: "2026-04-12", tax: 54000 }
    },
    {
      id: "match_2",
      confidence: 72,
      pr_record: { vendor: "Office Supplies", gstin: "09AABCO9012Q1Z3", invoice_no: "OS-000789", date: "2026-04-20", tax: 4500 },
      portal_record: { vendor: "Office Sup Co", gstin: "09AABCO9012Q1Z3", invoice_no: "789", date: "2026-04-21", tax: 4500 }
    }
  ]);

  const handleAction = (id, action) => {
    // Optimistic UI update
    setProbableMatches(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Review Probable Matches</h2>
        <p className="text-muted-foreground">The matching engine found {probableMatches.length} records that look similar but didn't pass strict rules. Force match or reject them.</p>
      </div>

      <div className="space-y-4">
        {probableMatches.map(match => (
          <Card key={match.id} className="overflow-hidden">
            <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-status-probable/10 text-status-probable border-status-probable/20">
                  {match.confidence}% Confidence
                </Badge>
                <span className="text-sm font-medium text-muted-foreground">Fuzzy text match on invoice number</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => handleAction(match.id, "reject")}>
                  <X className="mr-1.5 h-4 w-4" /> Reject (Keep Unmatched)
                </Button>
                <Button size="sm" className="bg-status-matched hover:bg-status-matched/90 text-white" onClick={() => handleAction(match.id, "accept")}>
                  <Check className="mr-1.5 h-4 w-4" /> Force Match
                </Button>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              {/* PR Record */}
              <div className="p-4 bg-background">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                  Books (Purchase Register)
                </div>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-3">
                    <span className="text-muted-foreground">Vendor:</span>
                    <span className="col-span-2 font-medium">{match.pr_record.vendor} <span className="text-xs text-muted-foreground font-normal">({match.pr_record.gstin})</span></span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="text-muted-foreground">Invoice No:</span>
                    <span className="col-span-2 font-mono bg-muted/50 px-1.5 py-0.5 rounded w-max">{match.pr_record.invoice_no}</span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="col-span-2">{match.pr_record.date}</span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="text-muted-foreground">Tax Amount:</span>
                    <span className="col-span-2 font-semibold">{formatINR(match.pr_record.tax)}</span>
                  </div>
                </div>
              </div>
              
              {/* 2B Record */}
              <div className="p-4 bg-background">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  Portal (GSTR-2B)
                </div>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-3">
                    <span className="text-muted-foreground">Vendor:</span>
                    <span className="col-span-2 font-medium">{match.portal_record.vendor} <span className="text-xs text-muted-foreground font-normal">({match.portal_record.gstin})</span></span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="text-muted-foreground">Invoice No:</span>
                    <span className="col-span-2 font-mono bg-muted/50 px-1.5 py-0.5 rounded w-max">{match.portal_record.invoice_no}</span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="col-span-2">{match.portal_record.date}</span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="text-muted-foreground">Tax Amount:</span>
                    <span className="col-span-2 font-semibold">{formatINR(match.portal_record.tax)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {probableMatches.length === 0 && (
          <div className="text-center p-12 border rounded-lg bg-muted/20">
            <h3 className="text-lg font-medium">All caught up!</h3>
            <p className="text-muted-foreground mt-1">No more probable matches require your review.</p>
            <Button asChild className="mt-4">
              <Link to="/runs/latest">Return to Results</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
