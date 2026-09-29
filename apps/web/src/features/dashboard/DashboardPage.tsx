import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import { ALERT_TYPE_LABELS, type DashboardSummaryDto, type KpiKey } from '@adpulse/types';
import { DataTable, EmptyState, ErrorState, PageHeader, SectionCard, StatusChip } from '@adpulse/ui';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { SpendValueChart, TrendChart } from '@/components/charts/charts';
import { FilterBar } from '@/components/FilterBar';
import { QueryError } from '@/components/QueryState';
import { Can, RequirePermission } from '@/components/RequirePermission';
import { campaignColumns } from '@/features/campaigns/columns';
import { useTriggerSync } from '@/features/integrations/api';
import { useFilterOptions } from '@/hooks/common';
import { useMetricFilters } from '@/hooks/useMetricFilters';
import { formatDate, formatRelative, humanize, useFormat } from '@/lib/format';
import { ACTION_STATUS_LABELS, ACTION_STATUS_TONE, SEVERITY_TONE, SYNC_STATUS_TONE } from '@/lib/status';
import { useDashboardOverview, useDashboardSummary, useTopCampaigns } from './api';
import { KpiGrid } from './KpiGrid';

const TREND_METRICS: KpiKey[] = ['cost', 'clicks', 'conversions', 'cpa', 'roas', 'ctr'];

function SummaryLink({ to, label }: { to: string; label: string }) {
  return (
    <Button component={RouterLink} to={to} size="small" endIcon={<ArrowForwardRounded fontSize="small" />}>
      {label}
    </Button>
  );
}

function SummaryPanels({ summary }: { summary: DashboardSummaryDto }) {
  const f = useFormat();
  const sync = summary.sync;
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' },
      }}
    >
      <SectionCard
        id="summary-alerts"
        title="Alerts"
        subtitle={`${summary.alerts.open} open · ${summary.alerts.critical} critical`}
        actions={<SummaryLink to="/alerts" label="All alerts" />}
      >
        {summary.alerts.latest.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No open alerts. Rules are evaluated after every sync.
          </Typography>
        ) : (
          <List dense disablePadding>
            {summary.alerts.latest.slice(0, 4).map((a) => (
              <ListItem
                key={a.id}
                disableGutters
                secondaryAction={<StatusChip tone={SEVERITY_TONE[a.severity]} label={humanize(a.severity)} />}
              >
                <ListItemText
                  primary={
                    <Link component={RouterLink} to={`/alerts?id=${a.id}`} underline="hover">
                      {ALERT_TYPE_LABELS[a.type]}
                    </Link>
                  }
                  secondary={a.entityName ?? a.adAccountName}
                  sx={{ pr: 10 }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </SectionCard>
      <SectionCard
        id="summary-recs"
        title="Recommendations"
        subtitle={`${summary.recommendations.open} awaiting review`}
        actions={<SummaryLink to="/recommendations" label="Review" />}
      >
        {summary.recommendations.latest.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No open recommendations right now.
          </Typography>
        ) : (
          <List dense disablePadding>
            {summary.recommendations.latest.slice(0, 4).map((r) => (
              <ListItem key={r.id} disableGutters>
                <ListItemText
                  primary={r.title}
                  secondary={r.campaignName ?? 'Organization-wide'}
                  slotProps={{ primary: { noWrap: true } }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </SectionCard>
      <SectionCard
        id="summary-actions"
        title="Recent actions"
        actions={<SummaryLink to="/actions" label="Board" />}
      >
        {summary.recentActions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No optimization actions yet. Create one from an alert or recommendation.
          </Typography>
        ) : (
          <List dense disablePadding>
            {summary.recentActions.slice(0, 4).map((a) => (
              <ListItem
                key={a.id}
                disableGutters
                secondaryAction={
                  <StatusChip tone={ACTION_STATUS_TONE[a.status]} label={ACTION_STATUS_LABELS[a.status]} />
                }
              >
                <ListItemText
                  primary={
                    <Link component={RouterLink} to={`/actions?id=${a.id}`} underline="hover">
                      {a.title}
                    </Link>
                  }
                  secondary={a.owner?.name ?? 'Unassigned'}
                  sx={{ pr: 12 }}
                  slotProps={{ primary: { noWrap: true } }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </SectionCard>
      <SectionCard
        id="summary-sync"
        title="Data sync"
        actions={<SummaryLink to="/integrations" label="Integrations" />}
      >
        {!sync ? (
          <Typography variant="body2" color="text.secondary">
            No synchronization has run yet.
          </Typography>
        ) : (
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <StatusChip tone={SYNC_STATUS_TONE[sync.status]} label={humanize(sync.status)} />
              <Typography variant="body2" color="text.secondary">
                {humanize(sync.type)} · {sync.adAccountName ?? 'All accounts'}
              </Typography>
            </Stack>
            {sync.status === 'RUNNING' && (
              <LinearProgress variant="determinate" value={sync.progress} aria-label="Sync progress" />
            )}
            <Typography variant="body2">
              {sync.finishedAt
                ? `Finished ${formatRelative(sync.finishedAt)}`
                : `Started ${formatRelative(sync.startedAt ?? sync.createdAt)}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDate(sync.rangeStart)} – {formatDate(sync.rangeEnd)} · {f.number(sync.rowsProcessed)}{' '}
              rows
            </Typography>
            {sync.errors[0] && <Alert severity="warning">{sync.errors[0].message}</Alert>}
          </Stack>
        )}
      </SectionCard>
    </Box>
  );
}

function DashboardContent() {
  const { filters, setFilters, resetFilters, apiParams, activeCount } = useMetricFilters();
  const [trendMetric, setTrendMetric] = useState<KpiKey>('cost');
  const overview = useDashboardOverview(apiParams);
  const summary = useDashboardSummary();
  const campaigns = useTopCampaigns(apiParams);
  const options = useFilterOptions();
  const sync = useTriggerSync();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const data = overview.data;
  const noAccounts = options.data && options.data.adAccounts.length === 0;
  const hasData = data && data.trend.some((d) => d.impressions > 0 || d.cost > 0);
  const search = `?from=${filters.from}&to=${filters.to}`;

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          data
            ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}${data.previousRange ? ` vs ${formatDate(data.previousRange.from)} – ${formatDate(data.previousRange.to)}` : ''}`
            : 'Performance across your advertising accounts'
        }
        actions={
          <Can permission="sync:trigger">
            <Button
              variant="outlined"
              startIcon={<SyncRounded />}
              disabled={sync.isPending || noAccounts}
              onClick={() =>
                sync.mutate(undefined, {
                  onSuccess: (r) =>
                    enqueueSnackbar(
                      r.created ? `Sync queued for ${r.jobs.length} account(s)` : 'A sync is already running',
                      { variant: 'info' },
                    ),
                  onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
                })
              }
            >
              Sync now
            </Button>
          </Can>
        }
      />
      <FilterBar filters={filters} onChange={setFilters} onReset={resetFilters} activeCount={activeCount} />

      {noAccounts ? (
        <SectionCard>
          <EmptyState
            title="Connect a data source to see performance"
            description="No advertising accounts are connected to this organization yet. Connect Google Ads or enable the demo data source."
            action={
              <Button variant="contained" component={RouterLink} to="/integrations">
                Go to integrations
              </Button>
            }
          />
        </SectionCard>
      ) : overview.isError ? (
        <SectionCard>
          <QueryError error={overview.error} onRetry={() => void overview.refetch()} />
        </SectionCard>
      ) : (
        <Stack spacing={2.5}>
          {data?.dataFreshness.isStale && (
            <Alert severity="warning" role="status">
              Data may be out of date. The latest metrics are from{' '}
              {formatDate(data.dataFreshness.lastMetricDate)} and the last successful sync was{' '}
              {formatRelative(data.dataFreshness.lastSuccessfulSyncAt)}.
            </Alert>
          )}
          {data && !hasData && (
            <Alert severity="info">
              No activity in the selected period and filters. Try a wider date range or clear the filters.
            </Alert>
          )}
          <KpiGrid
            current={data?.kpis.current ?? null}
            previous={data?.kpis.previous}
            change={data?.kpis.change}
            loading={overview.isPending}
          />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' } }}>
            <SectionCard
              id="trend"
              title="Trend"
              subtitle={filters.compare ? 'Dashed line shows the previous period' : undefined}
              actions={
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={trendMetric}
                  onChange={(_e, v: KpiKey | null) => v && setTrendMetric(v)}
                  aria-label="Trend metric"
                >
                  {TREND_METRICS.map((m) => (
                    <ToggleButton key={m} value={m} sx={{ px: 1.25, py: 0.25 }}>
                      {METRIC_DEFINITIONS[m].shortLabel}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              }
            >
              {data ? (
                <TrendChart data={data.trend} previous={data.previousTrend} metric={trendMetric} />
              ) : (
                <Skeleton variant="rounded" height={300} />
              )}
            </SectionCard>
            <SectionCard id="spend-value" title="Spend vs conversion value">
              {data ? <SpendValueChart data={data.trend} /> : <Skeleton variant="rounded" height={300} />}
            </SectionCard>
          </Box>
          <SectionCard
            id="top-campaigns"
            title="Top campaigns by spend"
            flush
            actions={<SummaryLink to={`/campaigns${search}`} label="All campaigns" />}
          >
            <DataTable
              label="Top campaigns by spend"
              rows={campaigns.data?.items ?? []}
              columns={campaignColumns(search)}
              getRowId={(r) => r.id}
              loading={campaigns.isPending || campaigns.isFetching}
              error={campaigns.isError ? errorMessage(campaigns.error) : null}
              onRetry={() => void campaigns.refetch()}
              onRowClick={(r) => navigate(`/campaigns/${r.id}${search}`)}
            />
          </SectionCard>
          {summary.isError ? (
            <ErrorState
              title="Could not load the activity summary"
              description={errorMessage(summary.error)}
              onRetry={() => void summary.refetch()}
              compact
            />
          ) : summary.data ? (
            <SummaryPanels summary={summary.data} />
          ) : (
            <Skeleton variant="rounded" height={180} />
          )}
        </Stack>
      )}
    </>
  );
}

export function DashboardPage() {
  return (
    <RequirePermission permission="analytics:read">
      <DashboardContent />
    </RequirePermission>
  );
}
