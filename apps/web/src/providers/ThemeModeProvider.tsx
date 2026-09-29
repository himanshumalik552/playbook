import { createAppTheme } from '@adpulse/ui';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type Preference = 'light' | 'dark' | 'system';

interface ThemeModeValue {
  preference: Preference;
  mode: 'light' | 'dark';
  setPreference: (preference: Preference) => void;
}

const STORAGE_KEY = 'adpulse.theme';
const ThemeModeContext = createContext<ThemeModeValue | null>(null);

function storedPreference(): Preference {
  const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [preference, setPreferenceState] = useState<Preference>(storedPreference);
  const mode = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const setPreference = useCallback((next: Preference) => {
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

export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
}
