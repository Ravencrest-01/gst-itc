import React from 'react';
import { NavLink } from 'react-router-dom';
import { PageHeader } from '../../components/data/PageHeader';
import { useAuth } from '../../context/AuthContext';

export function SettingsLayout({ title, subtitle, children }) {
  const { workspaceType } = useAuth();
  
  const tabs = [
    { label: 'Profile', path: '/settings/profile' },
    { label: 'Preferences', path: '/settings/preferences' },
    { label: 'Workspace', path: '/settings/workspace' },
    { label: 'Integrations', path: '/settings/integrations' },
    { label: 'Subscription', path: '/settings/subscription' },
  ];

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {tabs.map(tab => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium rounded-radius whitespace-nowrap transition-colors ${
                    isActive 
                      ? 'bg-accent/10 text-accent' 
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        
        <div className="flex-1 max-w-3xl">
          {children}
        </div>
      </div>
    </div>
  );
}
