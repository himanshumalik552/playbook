import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageLoader } from '@/components/FullPageLoader';
import { useAuth } from '@/providers/auth';
import { useOrg } from '@/providers/org';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user)
    return (
      <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    );
  return <Outlet />;
}

export function RequireOrganization() {
  const { user, isSuperAdmin } = useAuth();
  const { membership, settingsLoading, can } = useOrg();
  const location = useLocation();
  if (!membership) {
    if (isSuperAdmin && location.pathname.startsWith('/admin')) return <Outlet />;
    if (isSuperAdmin && location.pathname === '/profile') return <Outlet />;
    return <Navigate to={isSuperAdmin ? '/admin' : '/onboarding'} replace />;
  }
  if (!membership.onboardingCompleted && can('organization:manage') && user)
    return <Navigate to="/onboarding" replace />;
  if (settingsLoading) return <FullPageLoader />;
  return <Outlet />;
}

export function RedirectIfSignedIn() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
