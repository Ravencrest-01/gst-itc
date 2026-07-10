import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAsync } from '../hooks/useAsync';
import { list as listClients } from '../api/clients';
import { useAuth } from './AuthContext';

const ActiveClientContext = createContext(null);

export function ActiveClientProvider({ children }) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState(() => localStorage.getItem('activeClientId'));
  
  // Only load clients if authenticated
  const { data: clientsData, loading, error, reload } = useAsync(
    listClients, 
    !!user, 
    [user]
  );

  const clients = clientsData?.items || [];

  useEffect(() => {
    if (clients.length > 0) {
      // If we don't have an active client, or our active client was deleted/not in list
      const activeClientExists = clients.find(c => c.id === activeId);
      if (!activeId || !activeClientExists) {
        setActiveId(clients[0].id);
        localStorage.setItem('activeClientId', clients[0].id);
      }
    } else if (clients.length === 0 && !loading && user) {
      // No clients at all
      setActiveId(null);
      localStorage.removeItem('activeClientId');
    }
  }, [clients, activeId, loading, user]);

  const setActive = useCallback((id) => {
    setActiveId(id);
    if (id) {
      localStorage.setItem('activeClientId', id);
    } else {
      localStorage.removeItem('activeClientId');
    }
  }, []);

  const activeClient = clients.find((c) => c.id === activeId) || null;

  return (
    <ActiveClientContext.Provider 
      value={{ 
        clients, 
        loading, 
        error, 
        refresh: reload, 
        activeId, 
        setActive, 
        activeClient 
      }}
    >
      {children}
    </ActiveClientContext.Provider>
  );
}

export function useActiveClient() {
  return useContext(ActiveClientContext);
}
