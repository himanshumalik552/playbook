import { zodResolver } from '@hookform/resolvers/zod';
import GoogleIcon from '@mui/icons-material/Google';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { type LoginInput, loginSchema } from '@adpulse/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { AuthCard } from '@/layout/PublicLayout';
import { useAuth } from '@/providers/auth';
import { safeNext } from './safeNext';

const ERRORS: Record<string, string> = {
  google_unavailable:
    'Google sign-in is not configured for this environment. Sign in with email and password instead.',
  session_expired: 'Your session expired. Sign in again to continue.',
};

export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<string | null>(ERRORS[params.get('error') ?? ''] ?? null);
  const { control, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await signIn(values);
      navigate(user.memberships.length === 0 && user.systemRole !== 'SUPER_ADMIN' ? '/onboarding' : next, {
        replace: true,
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back. Sign in to your ADPULSE workspace."
      footer={
        <>
          New to ADPULSE?{' '}
          <Link
            component={RouterLink}
            to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
          >
            Create an account
          </Link>
        </>
      }
    >
      <Stack component="form" spacing={2} onSubmit={onSubmit} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <FormTextField
          control={control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          required
        />
        <FormTextField
          control={control}
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Link component={RouterLink} to="/forgot-password" variant="body2" sx={{ alignSelf: 'flex-end' }}>
          Forgot password?
        </Link>
        <Button type="submit" variant="contained" size="large" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <Divider>or</Divider>
        <Button
          variant="outlined"
          size="large"
          startIcon={<GoogleIcon />}
          href={`/api/v1/auth/google?next=${encodeURIComponent(next)}`}
        >
          Continue with Google
        </Button>
      </Stack>
    </AuthCard>
  );
}
