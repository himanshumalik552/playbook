import type {
  AdminOrganizationDto,
  AdminUserDto,
  FailedJobDto,
  FeatureFlagDto,
  QueueHealthDto,
  SyncJobDto,
  SystemHealthDto,
} from '@adpulse/types';
import {
  ConfirmDialog,
  type DataColumn,
  DataTable,
  EmptyState,
  ForbiddenState,
  PageHeader,
  SectionCard,
  StatusChip,
} from '@adpulse/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { type ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage, toParams } from '@/api/client';
import { QueryError } from '@/components/QueryState';
import { useDebounced } from '@/hooks/common';
import { formatDate, formatDateTime, formatRelative, humanize } from '@/lib/format';
import { SYNC_STATUS_TONE } from '@/lib/status';
import { useAuth } from '@/providers/auth';

const ADMIN_KEY = ['admin'] as const;

function usePaged<T>(path: string, search = '') {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const params = toParams({ page, pageSize, search });
  const query = useQuery({
    queryKey: [...ADMIN_KEY, path, params],
    queryFn: () => api.page<T>(path, params),
    placeholderData: keepPreviousData,
  });
  return {
    query,
    resetPage: () => setPage(1),
    table: {
      rows: query.data?.items ?? [],
      loading: query.isPending || query.isFetching,
      error: query.isError ? errorMessage(query.error) : null,
      onRetry: () => void query.refetch(),
      pagination: query.data
        ? {
            page,
            pageSize,
            total: query.data.meta.total,
            onPageChange: setPage,
            onPageSizeChange: (s: number) => {
              setPageSize(s);
              setPage(1);
            },
          }
        : undefined,
    },
  };
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'success' | 'error' }) {
  return (
    <SectionCard>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h2"
        component="p"
        color={tone === 'error' ? 'error.main' : tone === 'success' ? 'success.main' : undefined}
      >
        {value}
      </Typography>
    </SectionCard>
  );
}

function HealthTab() {
  const health = useQuery({
    queryKey: [...ADMIN_KEY, 'health'],
    queryFn: () => api.get<SystemHealthDto>('/admin/health'),
    refetchInterval: 15_000,
  });
  const queues = useQuery({
    queryKey: [...ADMIN_KEY, 'queues'],
    queryFn: () => api.get<QueueHealthDto[]>('/admin/queues'),
    refetchInterval: 15_000,
  });
  if (health.isError) return <QueryError error={health.error} onRetry={() => void health.refetch()} />;
  const h = health.data;
  const n = new Intl.NumberFormat();
  const queueColumns: DataColumn<QueueHealthDto>[] = [
    {
      key: 'name',
      header: 'Queue',
      render: (q) => (
        <Typography variant="body2" fontWeight={600}>
          {q.name}
        </Typography>
      ),
    },
    { key: 'waiting', header: 'Waiting', align: 'right', render: (q) => n.format(q.waiting) },
    { key: 'active', header: 'Active', align: 'right', render: (q) => n.format(q.active) },
    { key: 'delayed', header: 'Delayed', align: 'right', render: (q) => n.format(q.delayed) },
    {
      key: 'completed',
      header: 'Completed',
      align: 'right',
      hideOnMobile: true,
      render: (q) => n.format(q.completed),
    },
    {
      key: 'failed',
      header: 'Failed',
      align: 'right',
      render: (q) =>
        q.failed > 0 ? (
          <Typography variant="body2" color="error.main" fontWeight={600}>
            {n.format(q.failed)}
          </Typography>
        ) : (
          '0'
        ),
    },
  ];
  return (
    <Stack spacing={2.5}>
      {!h ? (
        <Skeleton variant="rounded" height={120} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)', xl: 'repeat(8, 1fr)' },
          }}
        >
          <Stat
            label="Status"
            value={h.status === 'ok' ? 'Healthy' : 'Degraded'}
            tone={h.status === 'ok' ? 'success' : 'error'}
          />
          <Stat
            label="Database"
            value={humanize(h.database)}
            tone={h.database === 'up' ? 'success' : 'error'}
          />
          <Stat label="Redis" value={humanize(h.redis)} tone={h.redis === 'up' ? 'success' : 'error'} />
          <Stat label="Integration mode" value={humanize(h.integrationMode)} />
          <Stat label="Organizations" value={n.format(h.counts.organizations)} />
          <Stat label="Users" value={n.format(h.counts.users)} />
          <Stat label="Metric rows" value={n.format(h.counts.metricRows)} />
          <Stat label="Open alerts" value={n.format(h.counts.openAlerts)} />
        </Box>
      )}
      {h && (
        <Typography variant="caption" color="text.secondary">
          Version {h.version} · up {Math.floor(h.uptimeSeconds / 3600)}h{' '}
          {Math.floor((h.uptimeSeconds % 3600) / 60)}m · memory {h.memory.rssMb} MB RSS, {h.memory.heapUsedMb}{' '}
          MB heap · {n.format(h.counts.campaigns)} campaigns
        </Typography>
      )}
      <SectionCard title="Job queues" subtitle="Refreshes every 15 seconds" flush>
        <DataTable
          label="Job queues"
          rows={queues.data ?? []}
          columns={queueColumns}
          getRowId={(q) => q.name}
          loading={queues.isPending}
          error={queues.isError ? errorMessage(queues.error) : null}
          onRetry={() => void queues.refetch()}
        />
      </SectionCard>
    </Stack>
  );
}

function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size="small"
      sx={{ m: 2, minWidth: 280 }}
    />
  );
}

function OrganizationsTab() {
  const [search, setSearch] = useState('');
  const { table, resetPage } = usePaged<AdminOrganizationDto>('/admin/organizations', useDebounced(search));
  const columns: DataColumn<AdminOrganizationDto>[] = [
    {
      key: 'name',
      header: 'Organization',
      render: (o) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {o.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {o.slug}
          </Typography>
        </Stack>
      ),
    },
    { key: 'members', header: 'Members', align: 'right', render: (o) => o.members },
    { key: 'accounts', header: 'Ad accounts', align: 'right', render: (o) => o.adAccounts },
    { key: 'created', header: 'Created', render: (o) => formatDate(o.createdAt) },
    {
      key: 'state',
      header: 'State',
      render: (o) => (
        <StatusChip tone={o.deletedAt ? 'neutral' : 'success'} label={o.deletedAt ? 'Deleted' : 'Active'} />
      ),
    },
  ];
  return (
    <SectionCard flush>
      <SearchBox
        label="Search organizations"
        value={search}
        onChange={(v) => {
          setSearch(v);
          resetPage();
        }}
      />
      <DataTable label="Organizations" columns={columns} getRowId={(o) => o.id} {...table} />
    </SectionCard>
  );
}

function UsersTab() {
  const [search, setSearch] = useState('');
  const { table, resetPage } = usePaged<AdminUserDto>('/admin/users', useDebounced(search));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const unlock = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/unlock`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, '/admin/users'] });
      enqueueSnackbar('Lockout cleared', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });
  const columns: DataColumn<AdminUserDto>[] = [
    {
      key: 'name',
      header: 'User',
      render: (u) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {u.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {u.email}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'role',
      header: 'System role',
      render: (u) => (
        <StatusChip
          tone={u.systemRole === 'SUPER_ADMIN' ? 'primary' : 'neutral'}
          label={humanize(u.systemRole)}
        />
      ),
    },
    { key: 'orgs', header: 'Organizations', align: 'right', render: (u) => u.organizations },
    { key: 'last', header: 'Last sign-in', render: (u) => formatRelative(u.lastLoginAt) },
    {
      key: 'lock',
      header: 'Lockout',
      render: (u) =>
        u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now() ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <StatusChip tone="warning" label={`Until ${formatDateTime(u.lockedUntil)}`} />
            <Button size="small" onClick={() => unlock.mutate(u.id)} disabled={unlock.isPending}>
              Unlock
            </Button>
          </Stack>
        ) : (
          '—'
        ),
    },
  ];
  return (
    <SectionCard flush>
      <SearchBox
        label="Search users"
        value={search}
        onChange={(v) => {
          setSearch(v);
          resetPage();
        }}
      />
      <DataTable label="Users" columns={columns} getRowId={(u) => u.id} {...table} />
    </SectionCard>
  );
}

function FeatureFlagsTab() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const flags = useQuery({
    queryKey: [...ADMIN_KEY, 'feature-flags'],
    queryFn: () => api.get<FeatureFlagDto[]>('/admin/feature-flags'),
  });
  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.patch<FeatureFlagDto>(`/admin/feature-flags/${key}`, { enabled }),
    onSuccess: async (f) => {
      await queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, 'feature-flags'] });
      enqueueSnackbar(`${f.key} ${f.enabled ? 'enabled' : 'disabled'}`, { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });
  const columns: DataColumn<FeatureFlagDto>[] = [
    {
      key: 'enabled',
      header: 'On',
      width: 64,
      render: (f) => (
        <Switch
          size="small"
          checked={f.enabled}
          disabled={toggle.isPending}
          onChange={(e) => toggle.mutate({ key: f.key, enabled: e.target.checked })}
          slotProps={{ input: { 'aria-label': `Toggle ${f.key}` } }}
        />
      ),
    },
    {
      key: 'key',
      header: 'Flag',
      render: (f) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
            {f.key}
          </Typography>
          {f.description && (
            <Typography variant="caption" color="text.secondary">
              {f.description}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      key: 'orgs',
      header: 'Organization overrides',
      render: (f) => (f.organizationIds.length ? `${f.organizationIds.length} organization(s)` : 'None'),
    },
    { key: 'updated', header: 'Updated', render: (f) => formatRelative(f.updatedAt) },
  ];
  return (
    <SectionCard flush>
      <DataTable
        label="Feature flags"
        rows={flags.data ?? []}
        columns={columns}
        getRowId={(f) => f.id}
        loading={flags.isPending}
        error={flags.isError ? errorMessage(flags.error) : null}
        onRetry={() => void flags.refetch()}
        empty={
          <EmptyState
            title="No feature flags"
            description="Flags are created by database seeds and migrations."
            compact
          />
        }
      />
    </SectionCard>
  );
}

function FailedJobsTab() {
  const { table } = usePaged<FailedJobDto>('/admin/failed-jobs');
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [discarding, setDiscarding] = useState<FailedJobDto | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
  const onError = (e: unknown) => enqueueSnackbar(errorMessage(e), { variant: 'error' });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/admin/failed-jobs/${id}/retry`),
    onSuccess: async () => {
      await invalidate();
      enqueueSnackbar('Job re-queued', { variant: 'success' });
    },
    onError,
  });
  const discard = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/failed-jobs/${id}`),
    onSuccess: async () => {
      setDiscarding(null);
      await invalidate();
      enqueueSnackbar('Job discarded', { variant: 'info' });
    },
    onError,
  });
  const columns: DataColumn<FailedJobDto>[] = [
    {
      key: 'name',
      header: 'Job',
      render: (j) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {j.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {j.queue} · {j.attemptsMade} attempt(s)
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'reason',
      header: 'Failure',
      render: (j) => (
        <Tooltip
          title={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(j.data, null, 2)}</pre>}
        >
          <Typography
            variant="caption"
            color="error.main"
            sx={{ display: 'block', maxWidth: 420, cursor: 'help' }}
            tabIndex={0}
          >
            {j.failedReason}
          </Typography>
        </Tooltip>
      ),
    },
    { key: 'when', header: 'Failed', render: (j) => formatRelative(j.timestamp) },
    {
      key: 'actions',
      header: <span aria-label="Job actions" />,
      align: 'right',
      render: (j) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => retry.mutate(j.id)} disabled={retry.isPending}>
            Retry
          </Button>
          <Button size="small" color="error" onClick={() => setDiscarding(j)}>
            Discard
          </Button>
        </Stack>
      ),
    },
  ];
  return (
    <SectionCard title="Dead-lettered jobs" subtitle="Jobs that exhausted their retries." flush>
      <DataTable
        label="Failed jobs"
        columns={columns}
        getRowId={(j) => j.id}
        empty={
          <EmptyState
            title="No failed jobs"
            description="All background jobs completed or are still retrying."
            compact
          />
        }
        {...table}
      />
      <ConfirmDialog
        open={Boolean(discarding)}
        title="Discard job?"
        description={`"${discarding?.name ?? ''}" will be removed permanently and not retried.`}
        confirmLabel="Discard"
        destructive
        loading={discard.isPending}
        onClose={() => setDiscarding(null)}
        onConfirm={() => discarding && discard.mutate(discarding.id)}
      />
    </SectionCard>
  );
}

type SyncFailure = SyncJobDto & { organizationId: string; organizationName: string };

function SyncFailuresTab() {
  const { table } = usePaged<SyncFailure>('/admin/sync-failures');
  const columns: DataColumn<SyncFailure>[] = [
    {
      key: 'org',
      header: 'Organization',
      render: (j) => (
        <Typography variant="body2" fontWeight={600}>
          {j.organizationName}
        </Typography>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) => <StatusChip tone={SYNC_STATUS_TONE[j.status]} label={humanize(j.status)} />,
    },
    {
      key: 'type',
      header: 'Sync',
      render: (j) => `${humanize(j.type)} · ${j.adAccountName ?? 'All accounts'}`,
    },
    {
      key: 'error',
      header: 'Error',
      render: (j) => (
        <Typography variant="caption">
          {j.errors[0] ? `${j.errors[0].code}: ${j.errors[0].message}` : '—'}
        </Typography>
      ),
    },
    { key: 'when', header: 'When', render: (j) => formatRelative(j.finishedAt ?? j.createdAt) },
  ];
  return (
    <SectionCard
      title="Integration failures"
      subtitle="Failed or partial syncs across all organizations."
      flush
    >
      <DataTable
        label="Sync failures"
        columns={columns}
        getRowId={(j) => j.id}
        empty={
          <EmptyState
            title="No sync failures"
            description="Every recent synchronization succeeded."
            compact
          />
        }
        {...table}
      />
    </SectionCard>
  );
}

const TABS = [
  { value: 'health', label: 'System health', element: <HealthTab /> },
  { value: 'organizations', label: 'Organizations', element: <OrganizationsTab /> },
  { value: 'users', label: 'Users', element: <UsersTab /> },
  { value: 'flags', label: 'Feature flags', element: <FeatureFlagsTab /> },
  { value: 'jobs', label: 'Failed jobs', element: <FailedJobsTab /> },
  { value: 'sync', label: 'Integration failures', element: <SyncFailuresTab /> },
] as const;

export function AdminPage() {
  const { isSuperAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  if (!isSuperAdmin) return <ForbiddenState />;
  const current = TABS.find((t) => t.value === params.get('tab')) ?? TABS[0];
  return (
    <>
      <PageHeader
        title="Platform administration"
        description="Super-admin tools. Actions here affect every organization and are audit-logged."
      />
      <Tabs
        value={current.value}
        onChange={(_e, v: string) => setParams(v === 'health' ? {} : { tab: v }, { replace: true })}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Administration sections"
        sx={{ mb: 2 }}
      >
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>
      {current.element}
    </>
  );
}
