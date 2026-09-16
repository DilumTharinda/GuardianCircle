/**
 * GuardianCircle — ThemeContext.js
 * Provides dark / light mode toggle across the app.
 * Usage:
 *   const { isDark, toggleTheme, colors } = useTheme();
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
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

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
