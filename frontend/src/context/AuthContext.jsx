import React, { createContext, useContext, useState, useEffect } from "react";
import { getMe, apiEvents } from "../api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for token
    const token = localStorage.getItem("auth_token");
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }

    // Listen for 401s
    const handleUnauthorized = () => {
      logout();
    };
    apiEvents.addEventListener("unauthorized", handleUnauthorized);

    return () => {
      apiEvents.removeEventListener("unauthorized", handleUnauthorized);
    };
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);
      const data = await getMe();
      setUser(data.user || data);
    } catch (error) {
      if (!error.isOffline) {
        localStorage.removeItem("auth_token");
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = (token, userData) => {
    localStorage.setItem("auth_token", token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
