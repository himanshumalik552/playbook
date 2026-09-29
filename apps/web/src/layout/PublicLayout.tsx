import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink, Outlet } from 'react-router-dom';
import { Logo } from './Logo';

const POINTS = [
  {
    icon: <InsightsOutlined />,
    title: 'One view of every account',
    text: 'KPIs, trends and period comparisons across all your Google Ads accounts.',
  },
  {
    icon: <TaskAltOutlined />,
    title: 'From signal to action',
    text: 'Evidence-based alerts and recommendations become tracked, evaluated actions.',
  },
  {
    icon: <ShieldOutlined />,
    title: 'Read-only by design',
    text: 'ADPULSE never changes campaigns, budgets, bids, keywords or targeting.',
  },
];

export function PublicLayout() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' } }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          color: '#fff',
          background: 'linear-gradient(155deg, #1A237E 0%, #3949AB 55%, #1565C0 100%)',
        }}
      >
        <Logo inverted />
        <Stack spacing={4} sx={{ maxWidth: 440 }}>
          <Typography variant="h1" component="p" sx={{ fontSize: '2.1rem', lineHeight: 1.2 }}>
            Performance management for Google Ads teams.
          </Typography>
          {POINTS.map((p) => (
            <Stack key={p.title} direction="row" spacing={2}>
              <Box sx={{ opacity: 0.9, mt: 0.25 }} aria-hidden>
                {p.icon}
              </Box>
              <Box>
                <Typography fontWeight={700}>{p.title}</Typography>
                <Typography sx={{ opacity: 0.85 }} variant="body2">
                  {p.text}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
        <Stack direction="row" spacing={2}>
          <Link component={RouterLink} to="/privacy" color="inherit" underline="hover" variant="body2">
            Privacy
          </Link>
          <Link component={RouterLink} to="/terms" color="inherit" underline="hover" variant="body2">
            Terms
          </Link>
        </Stack>
      </Box>
      <Box
        component="main"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2, sm: 4 } }}
      >
        <Box sx={{ width: '100%', maxWidth: 440 }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 3 }}>
            <Logo />
          </Box>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <Card sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h1" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }} component="div">
            {subtitle}
          </Typography>
        )}
        {children}
      </Card>
      {footer && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 2.5, textAlign: 'center' }}
          component="div"
        >
          {footer}
        </Typography>
      )}
    </>
  );
}

/** Simple centered page for legal and status pages that do not need the auth side panel. */
export function StaticPage({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', py: 6, px: 2 }}>
      <Box sx={{ maxWidth: 760, mx: 'auto' }}>
        <Box sx={{ mb: 4 }}>
          <RouterLink to="/" aria-label="ADPULSE home" style={{ textDecoration: 'none' }}>
            <Logo />
          </RouterLink>
        </Box>
        {children}
      </Box>
    </Box>
  );
}
