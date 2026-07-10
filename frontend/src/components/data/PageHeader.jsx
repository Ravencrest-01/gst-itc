import React from 'react';
import { Link } from 'react-router-dom';

export function PageHeader({ eyebrow, title, subtitle, actions, crumbs }) {
  return (
    <div className="mb-8">
      {crumbs && crumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          {crumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {crumb.path ? (
                <Link to={crumb.path} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
              {idx < crumbs.length - 1 && <span className="material-symbols-outlined text-[14px]">chevron_right</span>}
            </React.Fragment>
          ))}
        </nav>
      )}
      
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="text-sm font-medium text-accent mb-1">{eyebrow}</p>}
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex items-center gap-3 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
