import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useActiveClient } from '../../context/ActiveClientContext';
import { usePreferences } from '../../context/PreferencesContext';
import { client as apiClient } from '../../api/client';

export function Topbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { clients, activeId, setActive } = useActiveClient();
  const { prefs, setPref } = usePreferences();
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);
  const menuRef = useRef(null);

  useEffect(() => {
    // Ping API for connectivity
    const ping = async () => {
      try {
        await apiClient.get('');
        setApiOnline(true);
      } catch (err) {
        setApiOnline(false);
      }
    };
    ping();
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleNewRun = () => {
    if (activeId) {
      navigate(`/clients/${activeId}/runs/new`);
    } else {
      navigate('/clients');
    }
  };

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        {/* Company Switcher */}
        <select 
          className="bg-secondary border border-border text-foreground text-sm rounded-radius px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          value={activeId || ''}
          onChange={(e) => setActive(e.target.value)}
          disabled={clients.length === 0}
        >
          {clients.length === 0 ? (
            <option value="">No companies</option>
          ) : (
            clients.map((c) => (
              <option key={c.id} value={c.id}>{c.legal_name}</option>
            ))
          )}
        </select>

        {/* FY Switcher */}
        <select
          className="bg-transparent border-none text-foreground text-sm font-medium focus:outline-none cursor-pointer"
          value={prefs.financialYear}
          onChange={(e) => setPref('financialYear', e.target.value)}
        >
          <option value="2026-27">FY 2026-27</option>
          <option value="2025-26">FY 2025-26</option>
        </select>
      </div>

      <div className="flex items-center gap-6">
        <button 
          onClick={handleNewRun}
          className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
          New reconciliation
        </button>

        <div className="flex items-center gap-2" title={apiOnline ? "API Online" : "API Offline"}>
          <div className={`w-2.5 h-2.5 rounded-full ${apiOnline ? 'bg-matched' : 'bg-destructive'}`}></div>
        </div>

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-secondary text-foreground hover:bg-secondary/80 transition-colors font-medium border border-border"
          >
            {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
          </button>
          
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-radius shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-foreground truncate">{user?.full_name || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <Link 
                  to="/settings/profile" 
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">person</span>
                  Profile & settings
                </Link>
                <button 
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    navigate('/login');
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
