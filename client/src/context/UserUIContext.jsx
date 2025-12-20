import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import axios from '../utils/axiosConfig';
import { useAuth } from './AuthContext';

const UserUIContext = createContext(null);

const readLS = (key, def) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return def;
    return JSON.parse(raw);
  } catch (_) {
    return def;
  }
};

const writeLS = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (_) {}
};

export const UserUIProvider = ({ children }) => {
  const { user } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(() => readLS('ui:avatarOpen', false));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readLS('ui:sidebarCollapsed', false));
  const [lastUserPath, setLastUserPath] = useState(() => readLS('ui:lastUserPath', '/user/info'));
  
  // Default preferences
  const defaultPreferences = {
    theme: 'system', // system, light, dark
    fontFamily: 'Cascadia Code',
    fontSize: 14,
    tabSize: 4,
    indentUnit: 4,
    lineNumbers: true,
    foldGutter: true,
    matchBrackets: true
  };

  const [preferences, setPreferences] = useState(() => readLS('ui:preferences', defaultPreferences));

  useEffect(() => writeLS('ui:avatarOpen', avatarOpen), [avatarOpen]);
  useEffect(() => writeLS('ui:sidebarCollapsed', sidebarCollapsed), [sidebarCollapsed]);
  useEffect(() => writeLS('ui:lastUserPath', lastUserPath), [lastUserPath]);
  useEffect(() => writeLS('ui:preferences', preferences), [preferences]);

  // Fetch preferences from server when user logs in
  useEffect(() => {
    if (user) {
      axios.get('/api/user/preferences')
        .then(res => {
          if (res.data.preferences && Object.keys(res.data.preferences).length > 0) {
            // Merge server preferences with defaults to ensure all keys exist
            setPreferences(prev => ({ ...defaultPreferences, ...prev, ...res.data.preferences }));
          }
        })
        .catch(err => console.error("Failed to load preferences", err));
    }
  }, [user]);

  const updatePreferences = useCallback(async (newPrefs) => {
    setPreferences(prev => {
      const next = { ...prev, ...newPrefs };
      return next;
    });
    
    if (user) {
      try {
        // We need to merge with current state to send full object or just partial?
        // Let's send the partial update merged with current state
        const current = readLS('ui:preferences', defaultPreferences);
        const toSave = { ...current, ...newPrefs };
        await axios.put('/api/user/preferences', { preferences: toSave });
      } catch (err) {
        console.error("Failed to save preferences", err);
      }
    }
  }, [user]);

  const [isDark, setIsDark] = useState(false);

  // Apply theme
  useEffect(() => {
    const applyTheme = () => {
      const root = window.document.documentElement;
      const p = preferences.theme;
      
      let dark = false;
      root.classList.remove('light', 'dark');
      
      if (p === 'dark') {
        root.classList.add('dark');
        dark = true;
      } else if (p === 'light') {
        root.classList.add('light');
        dark = false;
      } else {
        // System
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.classList.add('dark');
          dark = true;
        } else {
          root.classList.add('light');
          dark = false;
        }
      }
      setIsDark(dark);
    };

    applyTheme();
    
    // Listen for system theme changes if in system mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (preferences.theme === 'system') {
        applyTheme();
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preferences.theme]);

  const value = useMemo(() => ({
    avatarOpen,
    setAvatarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    lastUserPath,
    setLastUserPath,
    preferences,
    updatePreferences,
    isDark
  }), [avatarOpen, sidebarCollapsed, lastUserPath, preferences, updatePreferences, isDark]);

  return (
    <UserUIContext.Provider value={value}>{children}</UserUIContext.Provider>
  );
};

export const useUserUI = () => useContext(UserUIContext);

