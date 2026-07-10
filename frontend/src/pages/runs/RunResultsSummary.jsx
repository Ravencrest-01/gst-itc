import React from 'react';
import { Kpi } from '../../components/data/Kpi';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { formatMoney } from '../../lib/format';

export default function RunResultsSummary({ summary }) {
  const { counts } = summary;
  
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Kpi 
          label="Total ITC (PR)" 
          value={formatMoney(summary.pr_total)} 
          accent="blue" 
        />
        <Kpi 
          label="Total ITC (2B)" 
          value={formatMoney(summary.gstr2b_total)} 
          accent="neutral" 
        />
        <Kpi 
          label="ITC at Risk" 
          value={formatMoney(summary.itc_at_risk)} 
          accent="risk" 
          sub="Missing in 2B + Mismatched"
        />
        <Kpi 
          label="Match Rate" 
          value={`${summary.match_rate || 0}%`} 
          accent="matched" 
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHead title="Bucket Breakdown (Rows)" />
          <CardBody className="space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-foreground flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-matched"></div>
                Matched
              </span>
              <span className="font-semibold mono-tabular">{counts?.matched || 0}</span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-foreground flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-attention"></div>
                Probable Match
              </span>
              <span className="font-semibold mono-tabular">{counts?.probable || 0}</span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-foreground flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-attention"></div>
                Mismatched
              </span>
              <span className="font-semibold mono-tabular">{counts?.mismatched || 0}</span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-foreground flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive"></div>
                Missing in Portal
              </span>
              <span className="font-semibold mono-tabular">{counts?.missing_in_portal || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-foreground flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted-foreground"></div>
                Missing in Books
              </span>
              <span className="font-semibold mono-tabular">{counts?.missing_in_books || 0}</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Action Summary" />
          <CardBody>
            <div className="bg-accent/10 border border-accent/20 rounded-radius p-6 flex flex-col items-center justify-center text-center h-full min-h-[250px]">
              <span className="material-symbols-outlined text-accent text-4xl mb-4">assignment_turned_in</span>
              <h3 className="text-xl font-bold text-foreground mb-2">
                {(counts?.probable || 0) + (counts?.mismatched || 0)} invoices need review
              </h3>
              <p className="text-muted-foreground text-sm max-w-sm">
                Review probable matches and mismatched invoices to correct or confirm them before exporting final reports.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
