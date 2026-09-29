import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { type RegisterInput, registerSchema } from '@adpulse/validation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { AuthCard } from '@/layout/PublicLayout';
import { useAuth } from '@/providers/AuthProvider';
import { safeNext } from './safeNext';

type RegisterForm = Omit<RegisterInput, 'acceptTerms'> & { acceptTerms: boolean };

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '', acceptTerms: false },
  });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setError(null);
    try {
      await register({ name, email, password });
      navigate(safeNext(params.get('next'), '/onboarding'), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      title="Create your account"
      subtitle="Set up a workspace in minutes. Start with demo data or connect Google Ads."
      footer={
        <>
          Already have an account?{' '}
          <Link component={RouterLink} to="/sign-in">
            Sign in
          </Link>
        </>
      }
    >
      <Stack component="form" spacing={2} onSubmit={onSubmit} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <FormTextField
          control={control}
          name="name"
          label="Full name"
          autoComplete="name"
          autoFocus
          required
        />
        <FormTextField
          control={control}
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          required
        />
        <FormTextField
          control={control}
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
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
        <Controller
          name="acceptTerms"
          control={control}
          render={({ field, fieldState }) => (
            <div>
              <FormControlLabel
                control={
                  <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                }
                label={
                  <>
                    I accept the{' '}
                    <Link component={RouterLink} to="/terms" target="_blank">
                      terms
                    </Link>{' '}
                    and{' '}
                    <Link component={RouterLink} to="/privacy" target="_blank">
                      privacy policy
                    </Link>
                  </>
                }
              />
              {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
            </div>
          )}
        />
        <Button type="submit" variant="contained" size="large" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </Stack>
    </AuthCard>
  );
}
