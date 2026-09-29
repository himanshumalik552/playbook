import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material/styles';

/**
 * Indigo/blue enterprise palette with restrained status colors. Status tones are chosen to keep
 * text contrast at WCAG AA (4.5:1) on both light and dark surfaces.
 */
const BRAND = {
  light: {
    primary: '#3949AB',
    secondary: '#1565C0',
    background: '#F5F7FB',
    paper: '#FFFFFF',
    text: '#1B2340',
    muted: '#5A6282',
  },
  dark: {
    primary: '#8C9EFF',
    secondary: '#64B5F6',
    background: '#0E1324',
    paper: '#161C31',
    text: '#E7EAF6',
    muted: '#A4ABC8',
  },
};

const STATUS = {
  light: { success: '#2E7D32', warning: '#A15C00', error: '#C62828', info: '#1565C0' },
  dark: { success: '#81C784', warning: '#FFB74D', error: '#EF9A9A', info: '#90CAF9' },
};

export function createAppTheme(mode: PaletteMode): Theme {
  const brand = BRAND[mode];
  const status = STATUS[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: brand.primary },
      secondary: { main: brand.secondary },
      success: { main: status.success },
      warning: { main: status.warning },
      error: { main: status.error },
      info: { main: status.info },
      background: { default: brand.background, paper: brand.paper },
      text: { primary: brand.text, secondary: brand.muted },
      divider: mode === 'light' ? '#E3E7F1' : '#262E4A',
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
      h1: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.01em' },
      h2: { fontSize: '1.4rem', fontWeight: 700 },
      h3: { fontSize: '1.15rem', fontWeight: 650 },
      h4: { fontSize: '1rem', fontWeight: 650 },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
      overline: { fontWeight: 700, letterSpacing: '0.08em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontFeatureSettings: '"tnum"' },
          '*:focus-visible': { outline: `2px solid ${brand.primary}`, outlineOffset: 2 },
        },
      },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: ({ theme }) => ({ borderColor: theme.palette.divider }) },
      },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiTableCell: {
        styleOverrides: {
          head: ({ theme }) => ({
            fontWeight: 600,
            color: theme.palette.text.secondary,
            backgroundColor: alpha(theme.palette.primary.main, mode === 'light' ? 0.04 : 0.08),
            whiteSpace: 'nowrap',
          }),
        },
      },
      MuiTooltip: { defaultProps: { arrow: true, enterDelay: 300 } },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    },
  });
}

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary';
