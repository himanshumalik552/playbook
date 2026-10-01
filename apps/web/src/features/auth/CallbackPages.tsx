import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ROLE_LABELS } from '@adpulse/types';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '@/api/client';
import { AuthCard } from '@/layout/PublicLayout';
import { useAuth } from '@/providers/auth';
import { useOrg } from '@/providers/org';
import { safeNext } from './safeNext';

const REASONS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  google_signin_failed: 'Google sign-in could not be completed. The link may have expired; please try again.',
};

/** Landing page after the API finishes Google sign-in and sets the session cookies. */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const success = params.get('status') === 'success';
  const started = useRef(false);

  useEffect(() => {
    if (!success || started.current) return;
    started.current = true;
    void refreshUser().then((user) => {
      if (!user) navigate('/sign-in?error=session_expired', { replace: true });
      else
        navigate(user.memberships.length === 0 ? '/onboarding' : safeNext(params.get('next')), {
          replace: true,
        });
    });
  }, [success, refreshUser, navigate, params]);

  if (success) {
    return (
      <AuthCard title="Signing you in">
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <span>Finishing Google sign-in…</span>
        </Stack>
      </AuthCard>
    );
  }
  const reason = params.get('reason') ?? '';
  return (
    <AuthCard title="Sign-in failed">
      <Stack spacing={2}>
        <Alert severity="error">{REASONS[reason] ?? 'Google sign-in could not be completed.'}</Alert>
        <Button component={RouterLink} to="/sign-in" variant="contained">
          Back to sign in
        </Button>
      </Stack>
    </AuthCard>
  );
}

interface InvitationPreview {
  organizationName: string;
  email: string;
  role: keyof typeof ROLE_LABELS;
  expiresAt: string;
}

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { switchOrganization } = useOrg();
  const here = `${location.pathname}${location.search}`;

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.post<InvitationPreview>('/invitations/preview', { token }, { skipOrg: true }),
    enabled: Boolean(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () =>
      api.post<{ organizationId: string }>('/invitations/accept', { token }, { skipOrg: true }),
    onSuccess: async (result) => {
      await refreshUser();
      if (result?.organizationId) switchOrganization(result.organizationId);
      navigate('/dashboard', { replace: true });
    },
  });

  if (!token) {
    return (
      <AuthCard title="Invalid invitation">
        <Alert severity="error">This invitation link is missing its token.</Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Join an organization">
      {preview.isPending && <CircularProgress size={24} />}
      {preview.isError && <Alert severity="error">{errorMessage(preview.error)}</Alert>}
      {preview.data && (
        <Stack spacing={2}>
          <Typography>
            You have been invited to join <strong>{preview.data.organizationName}</strong> as{' '}
            <strong>{ROLE_LABELS[preview.data.role]}</strong>.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The invitation was sent to {preview.data.email}.
          </Typography>
          {accept.isError && <Alert severity="error">{errorMessage(accept.error)}</Alert>}
          {user ? (
            user.email.toLowerCase() === preview.data.email.toLowerCase() ? (
              <Button
                variant="contained"
                size="large"
                onClick={() => accept.mutate()}
                disabled={accept.isPending}
              >
                Accept invitation
              </Button>
            ) : (
              <Alert severity="warning">
                You are signed in as {user.email}. Sign in with {preview.data.email} to accept this
                invitation.
              </Alert>
            )
          ) : (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="contained"
                component={RouterLink}
                to={`/sign-in?next=${encodeURIComponent(here)}`}
              >
                Sign in to accept
              </Button>
              <Button
                variant="outlined"
                component={RouterLink}
                to={`/register?next=${encodeURIComponent(here)}`}
              >
                Create an account
              </Button>
            </Stack>
          )}
        </Stack>
      )}
    </AuthCard>
  );
}
