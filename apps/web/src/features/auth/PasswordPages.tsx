import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
} from '@adpulse/validation';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { AuthCard } from '@/layout/PublicLayout';
import { useAuth } from '@/providers/AuthProvider';

const backToSignIn = (
  <Link component={RouterLink} to="/sign-in">
    Back to sign in
  </Link>
);

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/auth/forgot-password', values, { skipOrg: true });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your account email and we will send you a reset link."
      footer={backToSignIn}
    >
      {sent ? (
        <Alert severity="success">
          If an account exists for that address, a reset link is on its way. The link expires in one hour.
        </Alert>
      ) : (
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
          <Button type="submit" variant="contained" size="large" disabled={formState.isSubmitting}>
            Send reset link
          </Button>
        </Stack>
      )}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password }, { skipOrg: true });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (!token) {
    return (
      <AuthCard title="Invalid reset link" footer={backToSignIn}>
        <Alert severity="error">This link is missing its token. Request a new reset email.</Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Setting a new password signs you out on every device."
      footer={backToSignIn}
    >
      {done ? (
        <Stack spacing={2}>
          <Alert severity="success">Your password has been updated.</Alert>
          <Button component={RouterLink} to="/sign-in" variant="contained">
            Sign in
          </Button>
        </Stack>
      ) : (
        <Stack component="form" spacing={2} onSubmit={onSubmit} noValidate>
          {error && <Alert severity="error">{error}</Alert>}
          <FormTextField
            control={control}
            name="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            helperText="At least 12 characters with upper and lower case letters, a number and a symbol."
          />
          <FormTextField
            control={control}
            name="confirmPassword"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
          />
          <Button type="submit" variant="contained" size="large" disabled={formState.isSubmitting}>
            Update password
          </Button>
        </Stack>
      )}
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, refreshUser } = useAuth();
  const started = useRef(false);
  const verify = useMutation({
    mutationFn: () => api.post('/auth/verify-email', { token }, { skipOrg: true }),
    onSuccess: () => void refreshUser(),
  });

  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      verify.mutate();
    }
  }, [token, verify]);

  return (
    <AuthCard
      title="Verify your email"
      footer={
        user ? (
          <Link component={RouterLink} to="/dashboard">
            Go to dashboard
          </Link>
        ) : (
          backToSignIn
        )
      }
    >
      {!token && <Alert severity="error">This verification link is missing its token.</Alert>}
      {verify.isPending && (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <span>Verifying…</span>
        </Stack>
      )}
      {verify.isSuccess && <Alert severity="success">Your email address is verified. Thank you!</Alert>}
      {verify.isError && (
        <Alert severity="error">
          {errorMessage(verify.error)} The link may have expired; sign in and request a new one from your
          profile.
        </Alert>
      )}
    </AuthCard>
  );
}
