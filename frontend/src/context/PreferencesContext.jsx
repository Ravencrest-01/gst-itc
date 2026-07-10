import React, { createContext, useContext, useState, useEffect } from "react";

const PreferencesContext = createContext();

const defaultPreferences = {
  theme: "light", // 'light', 'dark', 'system'
  density: "normal", // 'compact', 'normal', 'comfortable'
  financialYear: "2023-24",
  pageSize: 25,
};

export function PreferencesProvider({ children }) {
  const [preferences, setPreferencesState] = useState(() => {
    const saved = localStorage.getItem("ui_preferences");
    const parsed = saved ? { ...defaultPreferences, ...JSON.parse(saved) } : defaultPreferences;
    // Force light theme if they had system cached, to meet the new requirement
    if (parsed.theme === "system" || parsed.theme === "dark") {
      parsed.theme = "light";
    }
    return parsed;
  });

  const updatePreferences = (newPrefs) => {
    setPreferencesState((prev) => {
      const updated = { ...prev, ...newPrefs };
      localStorage.setItem("ui_preferences", JSON.stringify(updated));
      return updated;
    });
  };

  // Apply theme to document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    
    let activeTheme = preferences.theme;
    if (activeTheme === "system") {
      activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    
    root.classList.add(activeTheme);
  }, [preferences.theme]);

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return context;
}
