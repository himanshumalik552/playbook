import { createContext, useContext } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeModeValue {
  preference: ThemePreference;
  mode: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeModeContext = createContext<ThemeModeValue | null>(null);

export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
}
