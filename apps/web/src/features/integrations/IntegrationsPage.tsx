import type {
  AdAccountDto,
  IntegrationConnectionDto,
  IntegrationOverviewDto,
  IntegrationProvider,
  SyncJobDto,
} from '@adpulse/types';
import {
  ConfirmDialog,
  type DataColumn,
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusChip,
} from '@adpulse/ui';
import AnalyticsOutlined from '@mui/icons-material/AnalyticsOutlined';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { type ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { QueryError } from '@/components/QueryState';
import { Can, RequirePermission } from '@/components/RequirePermission';
import { formatDate, formatRelative, humanize, useFormat } from '@/lib/format';
import { CONNECTION_STATUS_TONE, SYNC_STATUS_TONE } from '@/lib/status';
import { useOrg } from '@/providers/OrgProvider';
import { AccountPicker } from './AccountPicker';
import {
  useAdAccounts,
  useConnectDemo,
  useConnectGoogle,
  useDisconnect,
  useIntegrationsOverview,
  useSetAccountActive,
  useSyncJobs,
  useTriggerSync,
} from './api';
import { PropertyLinker } from './PropertyLinker';

const PROVIDERS: Record<IntegrationProvider, { name: string; icon: ReactNode; description: string }> = {
  GOOGLE_ADS: {
    name: 'Google Ads',
    icon: <CampaignOutlined />,
    description:
      'Read-only access to campaign, keyword and search-term performance. ADPULSE never changes campaigns, budgets, bids, keywords or targeting.',
  },
  GOOGLE_ANALYTICS: {
    name: 'Google Analytics 4',
    icon: <AnalyticsOutlined />,
    description: 'Read-only landing-page sessions and engagement, joined with ad clicks by landing-page URL.',
  },
};

const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: 'Google access was not granted. Nothing was connected.',
  connect_failed:
    'The Google connection could not be completed. Try again, and check that the OAuth client is configured for this environment.',
};

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" component="div">
        {children}
      </Typography>
    </Box>
  );
}

function ConnectionCard({
  provider,
  overview,
  onManage,
}: {
  provider: IntegrationProvider;
  overview: IntegrationOverviewDto;
  onManage: (c: IntegrationConnectionDto) => void;
}) {
  const info = PROVIDERS[provider];
  const connection =
    overview.connections.find((c) => c.provider === provider && c.status !== 'REVOKED') ?? null;
  const { enqueueSnackbar } = useSnackbar();
  const demo = useConnectDemo();
  const google = useConnectGoogle();
  const disconnect = useDisconnect();
  const [confirming, setConfirming] = useState(false);
  const onError = (e: unknown) => enqueueSnackbar(errorMessage(e), { variant: 'error' });
  const needsReconnect =
    connection &&
    (connection.status === 'NEEDS_ATTENTION' || connection.status === 'ERROR') &&
    !connection.isMock;

  const connect = () => {
    if (overview.mode === 'google') {
      google.mutate(provider, { onError });
      return;
    }
    demo.mutate(provider, {
      onSuccess: (c) => {
        enqueueSnackbar(`${info.name} demo data connected`, { variant: 'success' });
        onManage(c);
      },
      onError,
    });
  };

  return (
    <SectionCard
      title={
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ color: 'primary.main', display: 'flex' }}>{info.icon}</Box>
          <span>{info.name}</span>
        </Stack>
      }
      actions={
        connection ? (
          <StatusChip tone={CONNECTION_STATUS_TONE[connection.status]} label={humanize(connection.status)} />
        ) : (
          <StatusChip tone="neutral" label="Not connected" />
        )
      }
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {info.description}
        </Typography>
        {connection ? (
          <>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <Detail label="Account">
                {connection.isMock ? 'Demo data source' : (connection.externalEmail ?? '—')}
              </Detail>
              <Detail label="Connected">{formatDate(connection.connectedAt)}</Detail>
              <Detail label="Last successful sync">
                {connection.lastSuccessfulSyncAt
                  ? formatRelative(connection.lastSuccessfulSyncAt)
                  : 'Not yet'}
              </Detail>
              <Detail label="Permissions granted">
                {connection.isMock ? 'Not applicable' : `${connection.scopes.length} scope(s)`}
              </Detail>
            </Box>
            {connection.lastError && (
              <Alert severity={connection.status === 'ERROR' ? 'error' : 'warning'}>
                {connection.lastError}
              </Alert>
            )}
            <Can permission="integrations:manage">
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={() => onManage(connection)}>
                  {provider === 'GOOGLE_ADS' ? 'Choose accounts' : 'Link properties'}
                </Button>
                {needsReconnect && (
                  <Button
                    variant="contained"
                    onClick={() => google.mutate(provider, { onError })}
                    disabled={google.isPending}
                  >
                    Reconnect
                  </Button>
                )}
                <Button color="error" onClick={() => setConfirming(true)}>
                  Disconnect
                </Button>
              </Stack>
            </Can>
          </>
        ) : (
          <Can
            permission="integrations:manage"
            fallback={
              <Typography variant="body2" color="text.secondary">
                Ask an organization admin to connect {info.name}.
              </Typography>
            }
          >
            <Tooltip
              title={
                overview.mode === 'google' && !overview.googleConfigured
                  ? 'Google OAuth credentials are not configured on the server'
                  : ''
              }
            >
              <span>
                <Button
                  variant="contained"
                  onClick={connect}
                  disabled={
                    demo.isPending ||
                    google.isPending ||
                    (overview.mode === 'google' && !overview.googleConfigured)
                  }
                >
                  {overview.mode === 'mock' ? 'Connect demo data' : `Connect ${info.name}`}
                </Button>
              </span>
            </Tooltip>
          </Can>
        )}
      </Stack>
      <ConfirmDialog
        open={confirming}
        title={`Disconnect ${info.name}?`}
        description="Stored credentials are deleted and scheduled syncs stop. Historical data already imported stays available. You can reconnect at any time."
        confirmLabel="Disconnect"
        destructive
        loading={disconnect.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          connection &&
          disconnect.mutate(connection.id, {
            onSuccess: () => {
              setConfirming(false);
              enqueueSnackbar(`${info.name} disconnected`, { variant: 'info' });
            },
            onError,
          })
        }
      />
    </SectionCard>
  );
}

function AdAccounts() {
  const accounts = useAdAccounts();
  const setActive = useSetAccountActive();
  const sync = useTriggerSync();
  const { can } = useOrg();
  const { enqueueSnackbar } = useSnackbar();
  const onError = (e: unknown) => enqueueSnackbar(errorMessage(e), { variant: 'error' });

  const syncAccounts = (ids?: string[]) =>
    sync.mutate(ids, {
      onSuccess: (r) =>
        enqueueSnackbar(
          r.created
            ? `Sync queued for ${r.jobs.length} account(s)`
            : 'A sync is already running for these accounts',
          { variant: 'info' },
        ),
      onError,
    });

  const columns: DataColumn<AdAccountDto>[] = [
    {
      key: 'name',
      header: 'Account',
      render: (a) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {a.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {a.customerId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}
          </Typography>
        </Stack>
      ),
    },
    { key: 'currency', header: 'Currency', hideOnMobile: true, render: (a) => a.currencyCode },
    { key: 'tz', header: 'Timezone', hideOnMobile: true, render: (a) => a.timezone },
    {
      key: 'synced',
      header: 'Last synced',
      render: (a) => (a.lastSyncedAt ? formatRelative(a.lastSyncedAt) : 'Never'),
    },
    {
      key: 'active',
      header: 'Syncing',
      render: (a) => (
        <Switch
          size="small"
          checked={a.isActive}
          disabled={!can('integrations:manage') || setActive.isPending}
          onChange={(e) => setActive.mutate({ id: a.id, isActive: e.target.checked }, { onError })}
          slotProps={{ input: { 'aria-label': `${a.isActive ? 'Pause' : 'Resume'} syncing ${a.name}` } }}
        />
      ),
    },
    {
      key: 'sync',
      header: <span aria-label="Account actions" />,
      align: 'right',
      render: (a) =>
        can('sync:trigger') && a.isActive ? (
          <Button
            size="small"
            startIcon={<SyncOutlined />}
            onClick={() => syncAccounts([a.id])}
            disabled={sync.isPending}
          >
            Sync
          </Button>
        ) : null,
    },
  ];

  return (
    <SectionCard
      title="Ad accounts"
      subtitle="Paused accounts keep their history but are skipped by scheduled syncs."
      flush
      actions={
        <Can permission="sync:trigger">
          <Button
            variant="outlined"
            startIcon={<SyncOutlined />}
            onClick={() => syncAccounts()}
            disabled={sync.isPending || !accounts.data?.some((a) => a.isActive)}
          >
            Sync all now
          </Button>
        </Can>
      }
    >
      <DataTable
        label="Ad accounts"
        rows={accounts.data ?? []}
        columns={columns}
        getRowId={(a) => a.id}
        loading={accounts.isPending}
        error={accounts.isError ? errorMessage(accounts.error) : null}
        onRetry={() => void accounts.refetch()}
        empty={
          <EmptyState
            title="No ad accounts yet"
            description="Connect Google Ads and choose which accounts to import."
            compact
          />
        }
      />
    </SectionCard>
  );
}

function SyncHistory() {
  const f = useFormat();
  const [page, setPage] = useState(1);
  const jobs = useSyncJobs(page, 10);
  const columns: DataColumn<SyncJobDto>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (j) => (
        <Stack spacing={0.5}>
          <StatusChip tone={SYNC_STATUS_TONE[j.status]} label={humanize(j.status)} />
          {j.status === 'RUNNING' && (
            <LinearProgress
              variant="determinate"
              value={j.progress}
              sx={{ width: 80 }}
              aria-label={`${j.progress}% complete`}
            />
          )}
        </Stack>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (j) => `${humanize(j.type)} · ${j.provider === 'GOOGLE_ADS' ? 'Ads' : 'GA4'}`,
    },
    { key: 'account', header: 'Account', render: (j) => j.adAccountName ?? 'All accounts' },
    {
      key: 'range',
      header: 'Date range',
      hideOnMobile: true,
      render: (j) => `${formatDate(j.rangeStart)} – ${formatDate(j.rangeEnd)}`,
    },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      hideOnMobile: true,
      render: (j) => f.number(j.rowsProcessed, 0),
    },
    { key: 'started', header: 'Started', render: (j) => (j.startedAt ? f.dateTime(j.startedAt) : 'Waiting') },
    {
      key: 'errors',
      header: 'Details',
      render: (j) =>
        j.errors.length > 0 ? (
          <Tooltip title={j.errors.map((e) => `${e.code}: ${e.message}`).join('\n')}>
            <Typography variant="caption" color="error.main" sx={{ cursor: 'help' }} tabIndex={0}>
              {j.errors.length} error(s): {j.errors[0]?.message}
            </Typography>
          </Tooltip>
        ) : j.finishedAt ? (
          <Typography variant="caption" color="text.secondary">
            Finished {formatRelative(j.finishedAt)}
          </Typography>
        ) : null,
    },
  ];
  return (
    <SectionCard title="Sync history" flush>
      <DataTable
        label="Sync history"
        rows={jobs.data?.items ?? []}
        columns={columns}
        getRowId={(j) => j.id}
        loading={jobs.isPending}
        error={jobs.isError ? errorMessage(jobs.error) : null}
        onRetry={() => void jobs.refetch()}
        empty={
          <EmptyState
            title="No syncs yet"
            description="Syncs run automatically after accounts are selected, and on a schedule."
            compact
          />
        }
        pagination={
          jobs.data ? { page, pageSize: 10, total: jobs.data.meta.total, onPageChange: setPage } : undefined
        }
      />
    </SectionCard>
  );
}

function IntegrationsContent() {
  const overview = useIntegrationsOverview();
  const [params, setParams] = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const [managing, setManaging] = useState<{ id: string; provider: IntegrationProvider } | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  useEffect(() => {
    const connected = params.get('connected') as IntegrationProvider | null;
    const connectionId = params.get('connectionId');
    const error = params.get('error');
    if (!connected && !error) return;
    if (connected && connectionId && connected in PROVIDERS) {
      enqueueSnackbar(`${PROVIDERS[connected].name} connected`, { variant: 'success' });
      setManaging({ id: connectionId, provider: connected });
    }
    if (error)
      setCallbackError(
        CALLBACK_ERRORS[error] ?? `Google returned an error (${error}). Nothing was connected.`,
      );
    setParams({}, { replace: true });
  }, [params, setParams, enqueueSnackbar]);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Data sources are read-only. Secrets are stored encrypted on the server and never shown here."
      />
      {callbackError && (
        <Alert severity="error" onClose={() => setCallbackError(null)} sx={{ mb: 2 }}>
          {callbackError}
        </Alert>
      )}
      {overview.isError ? (
        <QueryError error={overview.error} onRetry={() => void overview.refetch()} />
      ) : !overview.data ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Skeleton variant="rounded" height={240} />
          <Skeleton variant="rounded" height={240} />
        </Box>
      ) : (
        <Stack spacing={2.5}>
          {overview.data.mode === 'mock' ? (
            <Alert severity="info" variant="outlined">
              Demo mode: the server runs with <code>INTEGRATION_MODE=mock</code>, so connections use
              deterministic synthetic data. No Google credentials are used.
            </Alert>
          ) : (
            !overview.data.googleConfigured && (
              <Alert severity="warning" variant="outlined">
                Google OAuth is not configured on the server. Set <code>GOOGLE_CLIENT_ID</code>,{' '}
                <code>GOOGLE_CLIENT_SECRET</code> and <code>GOOGLE_ADS_DEVELOPER_TOKEN</code> to enable
                connections.
              </Alert>
            )
          )}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            {(Object.keys(PROVIDERS) as IntegrationProvider[]).map((p) => (
              <ConnectionCard
                key={p}
                provider={p}
                overview={overview.data}
                onManage={(c) => setManaging({ id: c.id, provider: c.provider })}
              />
            ))}
          </Box>
          <AdAccounts />
          <SyncHistory />
        </Stack>
      )}
      <Dialog
        open={Boolean(managing)}
        onClose={() => setManaging(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="manage-title"
      >
        <DialogTitle id="manage-title">
          {managing?.provider === 'GOOGLE_ANALYTICS' ? 'Link GA4 properties' : 'Choose Google Ads accounts'}
        </DialogTitle>
        <DialogContent>
          {managing?.provider === 'GOOGLE_ADS' && (
            <AccountPicker connectionId={managing.id} onSaved={() => setManaging(null)} />
          )}
          {managing?.provider === 'GOOGLE_ANALYTICS' && (
            <PropertyLinker connectionId={managing.id} onSaved={() => setManaging(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function IntegrationsPage() {
  return (
    <RequirePermission permission="analytics:read">
      <IntegrationsContent />
    </RequirePermission>
  );
}
