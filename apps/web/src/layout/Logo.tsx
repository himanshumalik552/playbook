import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function Logo({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box component="svg" viewBox="0 0 64 64" sx={{ width: 32, height: 32, flexShrink: 0 }} aria-hidden>
        <rect width="64" height="64" rx="14" fill={inverted ? '#FFFFFF' : '#3949AB'} />
        <path
          d="M10 38h10l6-16 8 26 6-18 4 8h10"
          fill="none"
          stroke={inverted ? '#3949AB' : '#FFFFFF'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Box>
      {!compact && (
        <Typography
          component="span"
          sx={{
            fontWeight: 800,
            letterSpacing: '0.06em',
            fontSize: 18,
            color: inverted ? '#FFFFFF' : 'text.primary',
          }}
        >
          ADPULSE
        </Typography>
      )}
    </Box>
  );
}
