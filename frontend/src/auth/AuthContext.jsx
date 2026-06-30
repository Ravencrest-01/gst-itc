import React, { createContext, useContext, useEffect, useState } from "react";
import * as api from "../api/client";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    // any 401 anywhere logs the user out
    api.setUnauthorizedHandler(() => setUser(null));
    const token = api.getToken();
    if (!token) { setBooting(false); return; }
    api.me()
      .then(setUser)
      .catch(() => { api.setToken(null); setUser(null); })
      .finally(() => setBooting(false));
  }, []);

  const login = async (email, password, otp) => {
    const res = await api.login(email, password, otp);
    api.setToken(res.access_token);
    const u = await api.me();
    setUser(u);
    return u;
  };

  const register = async (data) => {
    const res = await api.register(data);
    api.setToken(res.access_token);
    const u = await api.me();
    setUser(u);
    return u;
  };

  const logout = () => { api.setToken(null); api.setActiveClient(null); setUser(null); };

  return (
    <AuthCtx.Provider value={{ user, booting, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}
