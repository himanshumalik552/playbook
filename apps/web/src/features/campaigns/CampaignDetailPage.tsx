import { meetsTarget, METRIC_DEFINITIONS } from '@adpulse/kpi';
import {
  type ActionListItemDto,
  type CampaignDetailDto,
  type KpiKey,
  OBJECTIVE_LABELS,
  type TargetMetric,
} from '@adpulse/types';
import { type DataColumn, DataTable, PageHeader, SectionCard, StatusChip } from '@adpulse/ui';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '@/api/client';
import { TrendChart } from '@/components/charts/charts';
import { FilterBar } from '@/components/FilterBar';
import { QueryError } from '@/components/QueryState';
import { RequirePermission } from '@/components/RequirePermission';
import { ActionDetailDrawer } from '@/features/actions/ActionDetailDrawer';
import { useActionList } from '@/features/actions/api';
import { AlertDetailDrawer } from '@/features/alerts/AlertDetailDrawer';
import { AlertsTable } from '@/features/alerts/AlertsTable';
import { KpiGrid } from '@/features/dashboard/KpiGrid';
import { SearchTermsTable } from '@/features/search-terms/SearchTermsTable';
import { useMetricFilters } from '@/hooks/useMetricFilters';
import { formatDate, humanize, useFormat } from '@/lib/format';
import { ACTION_STATUS_LABELS, ACTION_STATUS_TONE, CAMPAIGN_STATUS_TONE, PRIORITY_TONE } from '@/lib/status';
import { useOrg } from '@/providers/OrgProvider';
import { AdGroupsTab, BreakdownTab, ChangeHistoryTab, KeywordsTab, LandingPagesTab } from './tabs';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'ad-groups', label: 'Ad groups' },
  { value: 'keywords', label: 'Keywords' },
  { value: 'search-terms', label: 'Search terms' },
  { value: 'devices', label: 'Devices' },
  { value: 'locations', label: 'Locations' },
  { value: 'landing-pages', label: 'Landing pages' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'actions', label: 'Actions' },
  { value: 'history', label: 'Change history' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

const TARGET_ROWS: { metric: TargetMetric; kpi: KpiKey; direction: 'higher' | 'lower' }[] = [
  { metric: 'CPA', kpi: 'cpa', direction: 'lower' },
  { metric: 'ROAS', kpi: 'roas', direction: 'higher' },
  { metric: 'CTR', kpi: 'ctr', direction: 'higher' },
  { metric: 'CONVERSION_RATE', kpi: 'conversionRate', direction: 'higher' },
];

function ShareBar({ label, value }: { label: string; value: number | null }) {
  const f = useFormat();
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight={600}>
          {value === null ? '—' : f.percent(value * 100, 1)}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, (value ?? 0) * 100)}
        sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
        aria-label={label}
      />
    </Box>
  );
}

function OverviewTab({ campaign }: { campaign: CampaignDetailDto }) {
  const f = useFormat();
  const [metric, setMetric] = useState<KpiKey>('cost');
  return (
    <Stack spacing={2.5} sx={{ p: 2 }}>
      <KpiGrid current={campaign.current} previous={campaign.previous} change={campaign.change} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
        <SectionCard
          title="Daily trend"
          actions={
            <ToggleButtonGroup
              size="small"
              exclusive
              value={metric}
              onChange={(_e, v: KpiKey | null) => v && setMetric(v)}
              aria-label="Trend metric"
            >
              {(['cost', 'clicks', 'conversions', 'cpa', 'roas'] as KpiKey[]).map((m) => (
                <ToggleButton key={m} value={m} sx={{ px: 1.25, py: 0.25 }}>
                  {METRIC_DEFINITIONS[m].shortLabel}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          }
        >
          <TrendChart data={campaign.trend} metric={metric} />
        </SectionCard>
        <Stack spacing={2}>
          <SectionCard
            title="Against targets"
            subtitle="Effective targets for this campaign (campaign, account or organization level)"
          >
            <Stack spacing={1.25}>
              {TARGET_ROWS.map((t) => {
                const target = campaign.targets[t.metric];
                const actual = campaign.current[t.kpi];
                const met = target === undefined ? null : meetsTarget(actual, target, t.direction);
                return (
                  <Stack key={t.metric} direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2">{METRIC_DEFINITIONS[t.kpi].shortLabel}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" fontWeight={600}>
                        {f.metric(t.kpi, actual)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        / {target === undefined ? 'no target' : f.metric(t.kpi, target)}
                      </Typography>
                      {met !== null && (
                        <StatusChip
                          tone={met ? 'success' : 'error'}
                          label={met ? 'On target' : 'Off target'}
                        />
                      )}
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          </SectionCard>
          <SectionCard title="Search impression share" subtitle="Averaged over the selected period">
            <Stack spacing={1.5}>
              <ShareBar label="Impression share" value={campaign.searchImpressionShare} />
              <ShareBar label="Top of page" value={campaign.searchTopImpressionShare} />
              <ShareBar label="Absolute top" value={campaign.searchAbsoluteTopImpressionShare} />
              <ShareBar label="Lost to budget" value={campaign.searchBudgetLostImpressionShare} />
            </Stack>
          </SectionCard>
        </Stack>
      </Box>
    </Stack>
  );
}

function CampaignActions({ campaignId }: { campaignId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const list = useActionList({ campaignId, page, pageSize: 25 });
  const columns: DataColumn<ActionListItemDto>[] = [
    {
      key: 'title',
      header: 'Action',
      render: (a) => (
        <Typography variant="body2" fontWeight={600}>
          {a.title}
        </Typography>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <StatusChip tone={ACTION_STATUS_TONE[a.status]} label={ACTION_STATUS_LABELS[a.status]} />
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (a) => <StatusChip tone={PRIORITY_TONE[a.priority]} label={humanize(a.priority)} />,
    },
    { key: 'owner', header: 'Owner', render: (a) => a.owner?.name ?? 'Unassigned' },
    { key: 'planned', header: 'Planned', hideOnMobile: true, render: (a) => formatDate(a.plannedDate) },
  ];
  return (
    <>
      <DataTable
        label="Actions for this campaign"
        rows={list.data?.items ?? []}
        columns={columns}
        getRowId={(a) => a.id}
        loading={list.isPending}
        error={list.isError ? errorMessage(list.error) : null}
        onRowClick={(a) => setOpenId(a.id)}
        pagination={
          list.data ? { page, pageSize: 25, total: list.data.meta.total, onPageChange: setPage } : undefined
        }
      />
      <ActionDetailDrawer actionId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function CampaignAlerts({ campaignId }: { campaignId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  return (
    <>
      <AlertsTable
        params={{ campaignId }}
        page={page}
        pageSize={25}
        onPageChange={setPage}
        onOpen={(a) => setOpenId(a.id)}
      />
      <AlertDetailDrawer alertId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function CampaignDetailContent() {
  const { id = '' } = useParams();
  const { organizationId } = useOrg();
  const [params, setParams] = useSearchParams();
  const { filters, setFilters, resetFilters, apiParams, activeCount } = useMetricFilters();
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview') as TabValue;
  const detailParams = { ...apiParams };
  delete detailParams.adAccountId;
  delete detailParams.campaignIds;
  const entityParams = { ...detailParams, compare: false, campaignIds: id };

  const query = useQuery({
    queryKey: ['org', organizationId, 'campaigns', 'detail', id, detailParams],
    queryFn: () => api.get<CampaignDetailDto>(`/campaigns/${id}`, detailParams),
    placeholderData: keepPreviousData,
  });
  const campaign = query.data;
  const f = useFormat();
  const back = `/campaigns?from=${filters.from}&to=${filters.to}`;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs sx={{ mb: 1 }}>
            <Link component={RouterLink} to={back} underline="hover">
              Campaigns
            </Link>
            <Typography color="text.primary">{campaign?.name ?? '…'}</Typography>
          </Breadcrumbs>
        }
        title={campaign?.name ?? 'Campaign'}
        description={
          campaign ? (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <StatusChip tone={CAMPAIGN_STATUS_TONE[campaign.status]} label={humanize(campaign.status)} />
              <span>
                {campaign.adAccountName} · {OBJECTIVE_LABELS[campaign.objective]} ·{' '}
                {humanize(campaign.channelType)}
                {campaign.dailyBudget !== null ? ` · daily budget ${f.currency(campaign.dailyBudget)}` : ''}
                {campaign.startDate ? ` · since ${formatDate(campaign.startDate)}` : ''}
              </span>
            </Stack>
          ) : undefined
        }
        actions={
          <Button component={RouterLink} to={back} startIcon={<ArrowBackRounded />}>
            Back
          </Button>
        }
      />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        activeCount={activeCount}
        controls={['device', 'location', 'compare']}
      />
      {query.isError ? (
        <SectionCard>
          <QueryError error={query.error} onRetry={() => void query.refetch()} />
        </SectionCard>
      ) : (
        <SectionCard flush>
          <Tabs
            value={tab}
            onChange={(_e, v: TabValue) =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (v === 'overview') next.delete('tab');
                  else next.set('tab', v);
                  return next;
                },
                { replace: true },
              )
            }
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Campaign sections"
            sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}
          >
            {TABS.map((t) => (
              <Tab
                key={t.value}
                value={t.value}
                label={
                  t.value === 'alerts' && campaign?.openAlerts ? `Alerts (${campaign.openAlerts})` : t.label
                }
              />
            ))}
          </Tabs>
          <Box role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
            {tab === 'overview' &&
              (campaign ? (
                <OverviewTab campaign={campaign} />
              ) : (
                <Skeleton variant="rounded" height={420} sx={{ m: 2 }} />
              ))}
            {tab === 'ad-groups' && <AdGroupsTab params={entityParams} />}
            {tab === 'keywords' && <KeywordsTab params={entityParams} />}
            {tab === 'search-terms' && <SearchTermsTable baseParams={entityParams} />}
            {tab === 'devices' && (
              <BreakdownTab campaignId={id} dimension="device" params={detailParams} label="Device" />
            )}
            {tab === 'locations' && (
              <BreakdownTab campaignId={id} dimension="location" params={detailParams} label="Location" />
            )}
            {tab === 'landing-pages' && <LandingPagesTab params={entityParams} />}
            {tab === 'alerts' && <CampaignAlerts campaignId={id} />}
            {tab === 'actions' && <CampaignActions campaignId={id} />}
            {tab === 'history' && <ChangeHistoryTab campaignId={id} />}
          </Box>
        </SectionCard>
      )}
    </>
  );
}

export function CampaignDetailPage() {
  return (
    <RequirePermission permission="analytics:read">
      <CampaignDetailContent />
    </RequirePermission>
  );
}
