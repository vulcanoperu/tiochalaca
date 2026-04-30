import { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [apiKey, setApiKey]           = useState(localStorage.getItem('football_api_key') || '');
  const [apiQuota, setApiQuota]       = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [picks, setPicks]             = useState([]);
  const [activeLeague, setActiveLeague] = useState(null);

  const saveApiKey = useCallback((key) => {
    localStorage.setItem('football_api_key', key);
    setApiKey(key);
  }, []);

  return (
    <AppContext.Provider value={{
      apiKey, saveApiKey,
      apiQuota, setApiQuota,
      selectedMatch, setSelectedMatch,
      picks, setPicks,
      activeLeague, setActiveLeague,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
