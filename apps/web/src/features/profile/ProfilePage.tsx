import type { SessionInfo } from '@adpulse/types';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type ProfileInput,
  profileSchema,
} from '@adpulse/validation';
import { ConfirmDialog, type DataColumn, DataTable, PageHeader, SectionCard, StatusChip } from '@adpulse/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog';
import { formatRelative, useFormat } from '@/lib/format';
import { ME_QUERY_KEY, useAuth } from '@/providers/AuthProvider';

const SESSIONS_KEY = ['me', 'sessions'] as const;

function describeAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

function ProfileForm() {
  const { user, refreshUser } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, reset, formState } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '' },
  });
  const save = useMutation({
    mutationFn: (v: ProfileInput) => api.patch('/users/me', v),
    onSuccess: async (_d, v) => {
      reset(v);
      await refreshUser();
      enqueueSnackbar('Profile updated', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });
  const resend = useMutation({
    mutationFn: () => api.post('/auth/resend-verification'),
    onSuccess: () => enqueueSnackbar('Verification email sent', { variant: 'info' }),
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });

  return (
    <SectionCard title="Profile">
      <Box component="form" noValidate onSubmit={handleSubmit((v) => save.mutate(v))}>
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          <FormTextField control={control} name="name" label="Name" autoComplete="name" />
          <TextField
            label="Email"
            value={user?.email ?? ''}
            disabled
            helperText="Contact an administrator to change your sign-in email."
          />
          {user && !user.emailVerified && (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => resend.mutate()}
                  disabled={resend.isPending}
                >
                  Resend email
                </Button>
              }
            >
              Your email address is not verified yet.
            </Alert>
          )}
          <Box>
            <Button type="submit" variant="contained" disabled={!formState.isDirty || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </Box>
        </Stack>
      </Box>
      <UnsavedChangesDialog dirty={formState.isDirty} />
    </SectionCard>
  );
}

function PasswordForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const hasPassword = user?.hasPassword ?? true;
  const empty: ChangePasswordInput = { currentPassword: '', newPassword: '', confirmPassword: '' };
  const { control, handleSubmit, reset, setError } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: empty,
  });
  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: ChangePasswordInput) =>
      api.post('/users/me/password', { ...(hasPassword ? { currentPassword } : {}), newPassword }),
    onSuccess: async () => {
      reset(empty);
      await queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      enqueueSnackbar('Password changed. Other sessions were signed out.', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });

  return (
    <SectionCard
      title={hasPassword ? 'Change password' : 'Set a password'}
      subtitle={
        hasPassword ? undefined : 'You signed up with Google. Add a password to also sign in with email.'
      }
    >
      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit((v) => {
          if (hasPassword && !v.currentPassword) {
            setError('currentPassword', { message: 'Enter your current password' });
            return;
          }
          change.mutate(v);
        })}
      >
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          {hasPassword && (
            <FormTextField
              control={control}
              name="currentPassword"
              label="Current password"
              type="password"
              autoComplete="current-password"
            />
          )}
          <FormTextField
            control={control}
            name="newPassword"
            label="New password"
            type="password"
            autoComplete="new-password"
            helperText="At least 12 characters with upper- and lowercase letters, a number and a symbol."
          />
          <FormTextField
            control={control}
            name="confirmPassword"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
          />
          <Box>
            <Button type="submit" variant="contained" disabled={change.isPending}>
              {change.isPending ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
            </Button>
          </Box>
        </Stack>
      </Box>
    </SectionCard>
  );
}

function Sessions() {
  const f = useFormat();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [confirmAll, setConfirmAll] = useState(false);
  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => api.get<SessionInfo[]>('/users/me/sessions', undefined, { skipOrg: true }),
  });
  const onError = (e: unknown) => enqueueSnackbar(errorMessage(e), { variant: 'error' });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/users/me/sessions/${id}`, { skipOrg: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      enqueueSnackbar('Session signed out', { variant: 'info' });
    },
    onError,
  });
  const logoutAll = useMutation({
    mutationFn: () => api.post('/auth/logout-all', undefined, { skipOrg: true }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
    onError,
  });

  const columns: DataColumn<SessionInfo>[] = [
    {
      key: 'device',
      header: 'Device',
      render: (s) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" fontWeight={600}>
            {describeAgent(s.userAgent)}
          </Typography>
          {s.current && <StatusChip tone="success" label="This device" />}
        </Stack>
      ),
    },
    { key: 'ip', header: 'IP address', hideOnMobile: true, render: (s) => s.ipAddress ?? '—' },
    { key: 'signedIn', header: 'Signed in', hideOnMobile: true, render: (s) => f.dateTime(s.createdAt) },
    { key: 'last', header: 'Last active', render: (s) => formatRelative(s.lastUsedAt) },
    {
      key: 'actions',
      header: <span aria-label="Session actions" />,
      align: 'right',
      render: (s) =>
        s.current ? null : (
          <Button size="small" color="error" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>
            Sign out
          </Button>
        ),
    },
  ];

  return (
    <SectionCard
      title="Active sessions"
      subtitle="Sign out devices you no longer use or don't recognize."
      flush
      actions={
        <Button
          color="error"
          variant="outlined"
          startIcon={<LogoutOutlined />}
          onClick={() => setConfirmAll(true)}
        >
          Sign out everywhere
        </Button>
      }
    >
      <DataTable
        label="Active sessions"
        rows={sessions.data ?? []}
        columns={columns}
        getRowId={(s) => s.id}
        loading={sessions.isPending}
        error={sessions.isError ? errorMessage(sessions.error) : null}
        onRetry={() => void sessions.refetch()}
      />
      <ConfirmDialog
        open={confirmAll}
        title="Sign out everywhere?"
        description="Every session, including this one, is signed out. You will need to sign in again."
        confirmLabel="Sign out everywhere"
        destructive
        loading={logoutAll.isPending}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => logoutAll.mutate()}
      />
    </SectionCard>
  );
}

export function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile and security"
        description="Your personal details, password and signed-in devices."
      />
      <Stack spacing={2.5}>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
          <ProfileForm />
          <PasswordForm />
        </Box>
        <Sessions />
      </Stack>
    </>
  );
}
