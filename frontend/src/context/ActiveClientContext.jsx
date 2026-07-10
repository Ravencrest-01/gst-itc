import React, { createContext, useContext, useState, useEffect } from "react";

const ActiveClientContext = createContext();

export function ActiveClientProvider({ children }) {
  const [activeClientId, setActiveClientIdState] = useState(() => {
    return localStorage.getItem("active_client_id") || null;
  });

  const setActiveClientId = (id) => {
    if (id) {
      localStorage.setItem("active_client_id", id);
      setActiveClientIdState(id);
    } else {
      localStorage.removeItem("active_client_id");
      setActiveClientIdState(null);
    }
  };

  return (
    <ActiveClientContext.Provider value={{ activeClientId, setActiveClientId }}>
      {children}
    </ActiveClientContext.Provider>
  );
}

export function useActiveClient() {
  const context = useContext(ActiveClientContext);
  if (context === undefined) {
    throw new Error("useActiveClient must be used within an ActiveClientProvider");
  }
  return context;
}
