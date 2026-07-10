import React from 'react';
import { NavLink } from 'react-router-dom';

export function ClientTabs({ id }) {
  const tabs = [
    { label: 'Overview', path: `/clients/${id}` },
    { label: 'Vendors', path: `/clients/${id}/vendors` },
    { label: 'Uploaded files', path: `/clients/${id}/files` },
    { label: 'Reconciliations', path: `/clients/${id}/runs` },
  ];

  return (
    <div className="border-b border-border mb-6 flex overflow-x-auto">
      {tabs.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === `/clients/${id}`} // Exact match for Overview
          className={({ isActive }) =>
            `px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              isActive 
                ? 'border-accent text-accent' 
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
