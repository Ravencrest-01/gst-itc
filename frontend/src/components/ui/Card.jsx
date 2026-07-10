import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ children, className, ...props }) {
  return (
    <div className={cn("rounded-radius border border-border bg-card text-card-foreground shadow-sm overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHead({ title, actions, className }) {
  return (
    <div className={cn("flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30", className)}>
      <h3 className="text-lg font-semibold leading-none tracking-tight text-foreground">{title}</h3>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, flush = false, className }) {
  return (
    <div className={cn(flush ? "" : "p-6", className)}>
      {children}
    </div>
  );
}
