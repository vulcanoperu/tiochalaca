import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [picks, setPicks]             = useState([]);
  const [activeLeague, setActiveLeague] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('chalaca_theme') || 'standard');
  const [font, setFont] = useState(() => localStorage.getItem('chalaca_font') || 'outfit');
  const [textSize, setTextSize] = useState(() => localStorage.getItem('chalaca_text_size') || 'medium');

  useEffect(() => {
    localStorage.setItem('chalaca_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    
    // Remove previous theme classes
    document.documentElement.classList.remove('theme-standard', 'theme-light', 'theme-dark');
    document.documentElement.classList.add(`theme-${theme}`);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('chalaca_font', font);
    document.documentElement.classList.remove('font-outfit', 'font-inter', 'font-jakarta', 'font-roboto');
    document.documentElement.classList.add(`font-${font}`);
  }, [font]);

  useEffect(() => {
    localStorage.setItem('chalaca_text_size', textSize);
    document.documentElement.classList.remove('text-small', 'text-medium', 'text-large', 'text-xlarge');
    document.documentElement.classList.add(`text-${textSize}`);
  }, [textSize]);

  return (
    <AppContext.Provider value={{
      selectedMatch, setSelectedMatch,
      picks, setPicks,
      activeLeague, setActiveLeague,
      theme, setTheme,
      font, setFont,
      textSize, setTextSize,
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
