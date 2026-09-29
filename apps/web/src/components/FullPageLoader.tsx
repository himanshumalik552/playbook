import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export function FullPageLoader() {
  return (
    <Box
      sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}
      role="status"
      aria-label="Loading"
    >
      <CircularProgress />
    </Box>
  );
}
