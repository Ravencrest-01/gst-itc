import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { client } from '../api/client';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspaceType, setWorkspaceType] = useState(null);
  const [booting, setBooting] = useState(true);

  const loadSession = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setBooting(false);
      return;
    }
    
    try {
      const data = await authApi.me();
      setUser(data);
      setWorkspaceType(data.workspace_type || 'firm'); // Fallback to firm if missing
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem('token');
      }
      // If network error, we could fallback to local storage cached user in a real app
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    loadSession();

    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [loadSession]);

  const login = async (credentials) => {
    const data = await authApi.login(credentials);
    localStorage.setItem('token', data.access_token);
    await loadSession();
  };

  const register = async (payload) => {
    await authApi.register(payload);
    // login logic happens either here or by user entering OTP
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeClientId');
    setUser(null);
  };

  const updateProfile = async (updates) => {
    const data = await authApi.updateMe(updates);
    setUser(data);
  };

  return (
    <AuthContext.Provider value={{ user, workspaceType, booting, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
