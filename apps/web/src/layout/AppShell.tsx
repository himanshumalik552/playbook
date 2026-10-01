import AddOutlined from '@mui/icons-material/AddOutlined';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuRounded from '@mui/icons-material/MenuRounded';
import PersonOutline from '@mui/icons-material/PersonOutline';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { alpha, useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { ROLE_LABELS } from '@adpulse/types';
import { visuallyHidden } from '@adpulse/ui';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFilterOptions } from '@/hooks/common';
import { useAuth } from '@/providers/auth';
import { useOrg } from '@/providers/org';
import { useThemeMode } from '@/providers/themeMode';
import { Logo } from './Logo';
import { NAV_SECTIONS } from './navigation';

const WIDTH = 248;
const COLLAPSED = 72;
const COLLAPSE_KEY = 'adpulse.navCollapsed';

function SideNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { can } = useOrg();
  const { isSuperAdmin } = useAuth();
  const theme = useTheme();
  return (
    <Box component="nav" aria-label="Main navigation" sx={{ py: 1, overflowY: 'auto', flexGrow: 1 }}>
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((i) =>
          i.superAdmin ? isSuperAdmin : !i.permission || can(i.permission),
        );
        if (items.length === 0) return null;
        return (
          <List
            key={section.title}
            dense
            subheader={
              collapsed ? undefined : (
                <ListSubheader
                  disableSticky
                  sx={{
                    bgcolor: 'transparent',
                    lineHeight: '32px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {section.title}
                </ListSubheader>
              )
            }
          >
            {items.map((item) => (
              <Tooltip key={item.to} title={collapsed ? item.label : ''} placement="right">
                <ListItemButton
                  component={NavLink}
                  to={item.to}
                  onClick={onNavigate}
                  sx={{
                    mx: 1,
                    borderRadius: 2,
                    minHeight: 40,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    '&.active': {
                      bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.1 : 0.2),
                      color: 'primary.main',
                      '& .MuiListItemIcon-root': { color: 'primary.main' },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36 }}>{item.icon}</ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={item.label}
                      slotProps={{ primary: { fontWeight: 600, fontSize: 14 } }}
                    />
                  )}
                  {collapsed && (
                    <Box component="span" sx={visuallyHidden}>
                      {item.label}
                    </Box>
                  )}
                </ListItemButton>
              </Tooltip>
            ))}
          </List>
        );
      })}
    </Box>
  );
}

function OrganizationSwitcher() {
  const { user } = useAuth();
  const { organizationId, switchOrganization } = useOrg();
  const navigate = useNavigate();
  const memberships = user?.memberships ?? [];
  if (memberships.length === 0) return null;
  return (
    <TextField
      select
      size="small"
      label="Organization"
      value={organizationId ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') navigate('/onboarding?new=1');
        else {
          switchOrganization(e.target.value);
          navigate('/dashboard');
        }
      }}
      sx={{ minWidth: { xs: 140, sm: 200 }, maxWidth: 260 }}
      slotProps={{
        select: {
          renderValue: (v) => memberships.find((m) => m.organizationId === v)?.organizationName ?? '',
        },
      }}
    >
      {memberships.map((m) => (
        <MenuItem key={m.organizationId} value={m.organizationId}>
          <ListItemText primary={m.organizationName} secondary={ROLE_LABELS[m.role]} />
        </MenuItem>
      ))}
      <Divider />
      <MenuItem value="__new">
        <ListItemIcon>
          <AddOutlined fontSize="small" />
        </ListItemIcon>
        Create organization
      </MenuItem>
    </TextField>
  );
}

function AccountSwitcher() {
  const { adAccountId, setAdAccountId, can } = useOrg();
  const options = useFilterOptions();
  const accounts = options.data?.adAccounts ?? [];
  if (!can('analytics:read') || accounts.length === 0) return null;
  const value = accounts.some((a) => a.value === adAccountId) ? adAccountId : '';
  return (
    <TextField
      select
      size="small"
      label="Ad account"
      value={value ?? ''}
      onChange={(e) => setAdAccountId(e.target.value || null)}
      sx={{ minWidth: 170, display: { xs: 'none', md: 'inline-flex' } }}
    >
      <MenuItem value="">All accounts</MenuItem>
      {accounts.map((a) => (
        <MenuItem key={a.value} value={a.value}>
          {a.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <>
      <IconButton
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
      >
        <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'primary.main' }}>{initials}</Avatar>
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user?.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate('/profile');
          }}
        >
          <ListItemIcon>
            <PersonOutline fontSize="small" />
          </ListItemIcon>
          Profile & sessions
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            await signOut();
            enqueueSnackbar('Signed out', { variant: 'info' });
            navigate('/sign-in', { replace: true });
          }}
        >
          <ListItemIcon>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

export function AppShell() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const { mode, setPreference } = useThemeMode();
  const { organizationId } = useOrg();
  const location = useLocation();
  const width = isDesktop && collapsed ? COLLAPSED : WIDTH;

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        sx={{
          px: collapsed && isDesktop ? 1 : 2.5,
          justifyContent: collapsed && isDesktop ? 'center' : 'flex-start',
        }}
      >
        <Logo compact={collapsed && isDesktop} />
      </Toolbar>
      <Divider />
      <SideNav
        collapsed={collapsed && isDesktop}
        onNavigate={isDesktop ? undefined : () => setMobileOpen(false)}
      />
      {isDesktop && (
        <>
          <Divider />
          <Box sx={{ p: 1, display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
            <IconButton
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              size="small"
            >
              {collapsed ? <ChevronRightRounded /> : <ChevronLeftRounded />}
            </IconButton>
          </Box>
        </>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'absolute',
          left: -9999,
          '&:focus': { left: 16, top: 16, zIndex: 2000, p: 1, bgcolor: 'background.paper' },
        }}
      >
        Skip to content
      </Box>
      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width,
              boxSizing: 'border-box',
              transition: 'width 150ms',
              overflowX: 'hidden',
              borderRight: `1px solid ${theme.palette.divider}`,
            },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: WIDTH } }}
        >
          {drawerContent}
        </Drawer>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{
            borderBottom: `1px solid ${theme.palette.divider}`,
            bgcolor: alpha(theme.palette.background.paper, 0.9),
            backdropFilter: 'blur(8px)',
          }}
        >
          <Toolbar sx={{ gap: 1.5 }}>
            {!isDesktop && (
              <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                <MenuRounded />
              </IconButton>
            )}
            <OrganizationSwitcher />
            <AccountSwitcher />
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
              <IconButton
                onClick={() => setPreference(mode === 'dark' ? 'light' : 'dark')}
                aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {mode === 'dark' ? <LightModeOutlined /> : <DarkModeOutlined />}
              </IconButton>
            </Tooltip>
            <UserMenu />
          </Toolbar>
        </AppBar>
        <Box
          component="main"
          id="main"
          tabIndex={-1}
          sx={{
            flexGrow: 1,
            p: { xs: 2, sm: 3 },
            maxWidth: 1600,
            width: '100%',
            mx: 'auto',
            outline: 'none',
          }}
        >
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet key={organizationId ?? 'none'} />
          </ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}
