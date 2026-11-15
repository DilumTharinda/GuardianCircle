/**
 * GuardianCircle — ThemeContext.js
 * Provides dark / light mode toggle across the app.
 * Usage:
 *   const { isDark, toggleTheme, colors } = useTheme();
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { LIGHT_COLORS, DARK_COLORS } from '../constants/theme';

const ThemeContext = createContext({
  isDark: false,
  toggleTheme: () => {},
  colors: LIGHT_COLORS,
});

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const value = useMemo(() => ({
    isDark,
    toggleTheme,
    colors: isDark ? DARK_COLORS : LIGHT_COLORS,
  }), [isDark, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
