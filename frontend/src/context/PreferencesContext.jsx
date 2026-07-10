import React, { createContext, useContext, useState, useEffect } from 'react';

const PreferencesContext = createContext(null);

const defaultPrefs = {
  theme: 'light',
  density: 'comfortable',
  dateFormat: 'DD/MM/YYYY',
  financialYear: '2026-27',
  pageSize: 20
};

export function PreferencesProvider({ children }) {
  const [prefs, setPrefsState] = useState(() => {
    const saved = localStorage.getItem('preferences');
    return saved ? { ...defaultPrefs, ...JSON.parse(saved) } : defaultPrefs;
  });

  const setPref = (key, value) => {
    setPrefsState((prev) => {
      const newPrefs = { ...prev, [key]: value };
      localStorage.setItem('preferences', JSON.stringify(newPrefs));
      return newPrefs;
    });
  };

  const reset = () => {
    setPrefsState(defaultPrefs);
    localStorage.removeItem('preferences');
  };

  // Apply theme and density to document root
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', prefs.theme);
    root.setAttribute('data-density', prefs.density);
  }, [prefs.theme, prefs.density]);

  return (
    <PreferencesContext.Provider value={{ prefs, setPref, reset }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
