import { type InvitationDto, type MemberDto, ORG_ROLES, type OrgRole, ROLE_LABELS } from '@adpulse/types';
import { type InviteMemberInput, inviteMemberSchema } from '@adpulse/validation';
import {
  ConfirmDialog,
  type DataColumn,
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusChip,
} from '@adpulse/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import PersonAddAlt1Outlined from '@mui/icons-material/PersonAddAlt1Outlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { Can, RequirePermission } from '@/components/RequirePermission';
import { useMembers } from '@/hooks/common';
import { formatDate, formatRelative } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';

const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  ORGANIZATION_ADMIN: 'Everything, including integrations, members and organization settings',
  MARKETING_MANAGER: 'Manage targets, alert rules, assignments, schedules and syncs',
  ANALYST: 'Work alerts, create actions and recommendations, generate reports',
  VIEWER: 'Read-only access to dashboards and reports',
};

function RoleSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: OrgRole;
  onChange: (role: OrgRole) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <TextField
      select
      size="small"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as OrgRole)}
      slotProps={{
        htmlInput: { 'aria-label': label },
        select: { renderValue: (v) => ROLE_LABELS[v as OrgRole] },
      }}
      sx={{ minWidth: 190 }}
    >
      {ORG_ROLES.map((r) => (
        <MenuItem key={r} value={r}>
          <ListItemText
            primary={ROLE_LABELS[r]}
            secondary={ROLE_DESCRIPTIONS[r]}
            slotProps={{ secondary: { sx: { whiteSpace: 'normal', maxWidth: 320 } } }}
          />
        </MenuItem>
      ))}
    </TextField>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { organizationId } = useOrg();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, reset } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', role: 'ANALYST' },
  });
  useEffect(() => {
    if (open) reset({ email: '', role: 'ANALYST' });
  }, [open, reset]);

  const invite = useMutation({
    mutationFn: (v: InviteMemberInput) => api.post<InvitationDto>('/invitations', v),
    onSuccess: async (inv) => {
      await queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'invitations'] });
      enqueueSnackbar(`Invitation sent to ${inv.email}`, { variant: 'success' });
      onClose();
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="invite-title">
      <form noValidate onSubmit={handleSubmit((v) => invite.mutate(v))}>
        <DialogTitle id="invite-title">Invite a teammate</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormTextField
              control={control}
              name="email"
              label="Email"
              type="email"
              autoComplete="off"
              required
              autoFocus
            />
            <FormTextField control={control} name="role" label="Role" select>
              {ORG_ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  <ListItemText
                    primary={ROLE_LABELS[r]}
                    secondary={ROLE_DESCRIPTIONS[r]}
                    slotProps={{ secondary: { sx: { whiteSpace: 'normal' } } }}
                  />
                </MenuItem>
              ))}
            </FormTextField>
            <Typography variant="caption" color="text.secondary">
              The invitation link expires after 7 days and can only be accepted by this email address.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={invite.isPending}>
            {invite.isPending ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function TeamContent() {
  const { organizationId, can, membership } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const members = useMembers();
  const manage = can('members:manage');
  const invitations = useQuery({
    queryKey: ['org', organizationId, 'invitations'],
    queryFn: () => api.get<InvitationDto[]>('/invitations'),
    enabled: manage,
  });
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<MemberDto | null>(null);
  const [revoking, setRevoking] = useState<InvitationDto | null>(null);
  const onError = (e: unknown) => enqueueSnackbar(errorMessage(e), { variant: 'error' });
  const invalidate = (key: string) =>
    queryClient.invalidateQueries({ queryKey: ['org', organizationId, key] });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: OrgRole }) =>
      api.patch<MemberDto>(`/memberships/${id}`, { role }),
    onSuccess: async (m) => {
      await invalidate('members');
      enqueueSnackbar(`${m.name} is now ${ROLE_LABELS[m.role].toLowerCase()}`, { variant: 'success' });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/memberships/${id}`),
    onSuccess: async () => {
      setRemoving(null);
      await invalidate('members');
      enqueueSnackbar('Member removed', { variant: 'info' });
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/invitations/${id}`),
    onSuccess: async () => {
      setRevoking(null);
      await invalidate('invitations');
      enqueueSnackbar('Invitation revoked', { variant: 'info' });
    },
    onError,
  });

  const memberColumns: DataColumn<MemberDto>[] = [
    {
      key: 'name',
      header: 'Member',
      render: (m) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {m.name}
            {m.userId === user?.id ? ' (you)' : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {m.email}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (m) =>
        manage && m.userId !== user?.id ? (
          <RoleSelect
            value={m.role}
            label={`Role for ${m.name}`}
            disabled={changeRole.isPending}
            onChange={(role) => role !== m.role && changeRole.mutate({ id: m.id, role })}
          />
        ) : (
          <StatusChip
            tone={m.role === 'ORGANIZATION_ADMIN' ? 'primary' : 'neutral'}
            label={ROLE_LABELS[m.role]}
          />
        ),
    },
    { key: 'joined', header: 'Joined', hideOnMobile: true, render: (m) => formatDate(m.joinedAt) },
    { key: 'last', header: 'Last active', hideOnMobile: true, render: (m) => formatRelative(m.lastLoginAt) },
    {
      key: 'actions',
      header: <span aria-label="Member actions" />,
      align: 'right',
      render: (m) =>
        manage && m.userId !== user?.id ? (
          <Button size="small" color="error" onClick={() => setRemoving(m)}>
            Remove
          </Button>
        ) : null,
    },
  ];

  const invitationColumns: DataColumn<InvitationDto>[] = [
    {
      key: 'email',
      header: 'Email',
      render: (i) => (
        <Typography variant="body2" fontWeight={600}>
          {i.email}
        </Typography>
      ),
    },
    { key: 'role', header: 'Role', render: (i) => ROLE_LABELS[i.role] },
    { key: 'by', header: 'Invited by', hideOnMobile: true, render: (i) => i.invitedBy ?? '—' },
    {
      key: 'expires',
      header: 'Expires',
      render: (i) =>
        new Date(i.expiresAt).getTime() < Date.now() ? (
          <StatusChip tone="warning" label="Expired" />
        ) : (
          formatRelative(i.expiresAt)
        ),
    },
    {
      key: 'actions',
      header: <span aria-label="Invitation actions" />,
      align: 'right',
      render: (i) => (
        <Button size="small" color="error" onClick={() => setRevoking(i)}>
          Revoke
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Team and roles"
        description={`Members of ${membership?.organizationName ?? 'this organization'} and what they can do.`}
        actions={
          <Can permission="members:manage">
            <Button
              variant="contained"
              startIcon={<PersonAddAlt1Outlined />}
              onClick={() => setInviting(true)}
            >
              Invite
            </Button>
          </Can>
        }
      />
      <Stack spacing={2.5}>
        <SectionCard title="Members" flush>
          <DataTable
            label="Members"
            rows={members.data ?? []}
            columns={memberColumns}
            getRowId={(m) => m.id}
            loading={members.isPending}
            error={members.isError ? errorMessage(members.error) : null}
            onRetry={() => void members.refetch()}
          />
        </SectionCard>
        {manage && (
          <SectionCard title="Pending invitations" flush>
            <DataTable
              label="Pending invitations"
              rows={invitations.data ?? []}
              columns={invitationColumns}
              getRowId={(i) => i.id}
              loading={invitations.isPending}
              error={invitations.isError ? errorMessage(invitations.error) : null}
              onRetry={() => void invitations.refetch()}
              empty={
                <EmptyState
                  title="No pending invitations"
                  description="Invite teammates to collaborate on alerts, actions and reports."
                  compact
                />
              }
            />
          </SectionCard>
        )}
      </Stack>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove member?"
        description={`${removing?.name ?? ''} will lose access to this organization immediately. Their past actions and comments remain.`}
        confirmLabel="Remove"
        destructive
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revoke invitation?"
        description={`The invitation link sent to ${revoking?.email ?? ''} will stop working.`}
        confirmLabel="Revoke"
        destructive
        loading={revoke.isPending}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </>
  );
}

export function TeamPage() {
  return (
    <RequirePermission permission="analytics:read">
      <TeamContent />
    </RequirePermission>
  );
}
