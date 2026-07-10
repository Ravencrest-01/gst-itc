import React from 'react';
import { cn } from '../../lib/utils';
import { Card } from '../ui/Card';

export function Kpi({ label, value, sub, accent = 'neutral', className }) {
  const accents = {
    matched: 'bg-matched',
    attention: 'bg-attention',
    risk: 'bg-destructive',
    neutral: 'bg-border',
    blue: 'bg-accent',
  };

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <div className={cn("absolute top-0 left-0 bottom-0 w-1.5", accents[accent])} />
      <div className="p-6 pl-8">
        <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
        <p className="text-3xl font-bold tracking-tight text-foreground mono-tabular">
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
      </div>
    </Card>
  );
}
