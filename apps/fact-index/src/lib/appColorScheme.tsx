import React, { createContext, useContext } from 'react';

type AppColorScheme = {
  colorScheme: 'light' | 'dark';
  toggleColorScheme: (value?: 'light' | 'dark') => void;
};

const AppColorSchemeContext = createContext<AppColorScheme | undefined>(undefined);

export const AppColorSchemeProvider = AppColorSchemeContext.Provider;

export function useAppColorScheme() {
  const ctx = useContext(AppColorSchemeContext);
  if (!ctx) {
    throw new Error('useAppColorScheme must be used within AppColorSchemeProvider');
  }
  return ctx;
}

export default AppColorSchemeContext;
