import { createAppTheme } from '@adpulse/ui';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { ThemeModeContext, type ThemePreference } from './themeMode';

const STORAGE_KEY = 'adpulse.theme';

function storedPreference(): ThemePreference {
  const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [preference, setPreferenceState] = useState<ThemePreference>(storedPreference);
  const mode = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ preference, mode, setPreference }), [preference, mode, setPreference]);
  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
