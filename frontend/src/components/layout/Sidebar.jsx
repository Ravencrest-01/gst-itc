import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useActiveClient } from '../../context/ActiveClientContext';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/clients', label: 'Companies', icon: 'business' },
  { path: '/files', label: 'Files', icon: 'folder' },
  { path: '/runs', label: 'Reconciliations', icon: 'sync_alt' },
  { path: '/review', label: 'Action needed', icon: 'assignment_turned_in' },
  { path: '/reports', label: 'Reports', icon: 'bar_chart' },
  { path: '/members', label: 'Team', icon: 'group', firmOnly: true },
  { path: '/settings/profile', label: 'Settings', icon: 'settings' },
];

export function Sidebar() {
  const { workspaceType } = useAuth();
  const { activeId } = useActiveClient();

  return (
    <aside className="w-64 bg-primary text-white flex flex-col h-full shrink-0">
      <div className="h-16 flex items-center px-6 font-bold text-xl tracking-tight border-b border-white/10">
        ITC-Rec Engine
      </div>
      <nav className="flex-1 py-6 flex flex-col gap-1 px-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          if (item.firmOnly && workspaceType === 'solo') return null;
          
          let targetPath = item.path;
          if (activeId) {
            if (item.path === '/files') targetPath = `/clients/${activeId}/files`;
            if (item.path === '/runs') targetPath = `/clients/${activeId}/runs`;
            if (item.path === '/review') targetPath = `/clients/${activeId}/review`;
          }

          return (
            <NavLink
              key={item.path}
              to={targetPath}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-radius transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-4 border-t border-white/10 text-xs text-white/50 text-center">
        ITC-Rec Engine v1.0
      </div>
    </aside>
  );
}
