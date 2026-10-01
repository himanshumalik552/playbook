import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import type {
  AdGroupRowDto,
  ChangeLogDto,
  DimensionRowDto,
  KeywordRowDto,
  KpiKey,
  LandingPageRowDto,
} from '@adpulse/types';
import { type DataColumn, DataTable, SectionCard, StatusChip } from '@adpulse/ui';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage, toParams } from '@/api/client';
import { BreakdownBarChart } from '@/components/charts/charts';
import { formatDateTime, humanize, useFormat } from '@/lib/format';
import { CAMPAIGN_STATUS_TONE } from '@/lib/status';
import { useOrg } from '@/providers/org';
import { metricColumn } from './columns';

type Params = Record<string, string | number | boolean>;

function usePagedEntity<T>(path: string, params: Params, defaultSort = 'cost') {
  const { organizationId } = useOrg();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ by: string; dir: 'asc' | 'desc' }>({ by: defaultSort, dir: 'desc' });
  const full = { ...params, ...toParams({ page, pageSize, sortBy: sort.by, sortDir: sort.dir }) };
  const query = useQuery({
    queryKey: ['org', organizationId, path, full],
    queryFn: () => api.page<T>(path, full),
    placeholderData: keepPreviousData,
  });
  return {
    query,
    tableProps: {
      rows: query.data?.items ?? [],
      loading: query.isPending || query.isFetching,
      error: query.isError ? errorMessage(query.error) : null,
      onRetry: () => void query.refetch(),
      sort,
      onSortChange: (s: { by: string; dir: 'asc' | 'desc' }) => {
        setSort(s);
        setPage(1);
      },
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

const standardMetrics = <T,>(get: (r: T) => { current: DimensionRowDto['metrics'] }): DataColumn<T>[] => [
  metricColumn('cost', get),
  metricColumn('impressions', get, true),
  metricColumn('clicks', get),
  metricColumn('ctr', get, true),
  metricColumn('conversions', get),
  metricColumn('cpa', get),
  metricColumn('roas', get, true),
];

export function AdGroupsTab({ params }: { params: Params }) {
  const { tableProps } = usePagedEntity<AdGroupRowDto>('/ad-groups', params);
  const columns: DataColumn<AdGroupRowDto>[] = [
    {
      key: 'name',
      header: 'Ad group',
      sortKey: 'name',
      minWidth: 200,
      render: (r) => (
        <Typography variant="body2" fontWeight={600}>
          {r.name}
        </Typography>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      hideOnMobile: true,
      render: (r) => <StatusChip tone={CAMPAIGN_STATUS_TONE[r.status]} label={humanize(r.status)} />,
    },
    ...standardMetrics<AdGroupRowDto>((r) => ({ current: r.metrics })),
  ];
  return <DataTable label="Ad groups" columns={columns} getRowId={(r) => r.id} {...tableProps} />;
}

export function KeywordsTab({ params }: { params: Params }) {
  const { tableProps } = usePagedEntity<KeywordRowDto>('/keywords', params);
  const columns: DataColumn<KeywordRowDto>[] = [
    {
      key: 'text',
      header: 'Keyword',
      sortKey: 'text',
      minWidth: 200,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {r.matchType === 'EXACT' ? `[${r.text}]` : r.matchType === 'PHRASE' ? `"${r.text}"` : r.text}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {r.adGroupName} · {humanize(r.matchType)}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'qualityScore',
      header: 'QS',
      headerTooltip: 'Quality Score (1–10) as reported by Google Ads',
      sortKey: 'qualityScore',
      align: 'right',
      render: (r) => r.qualityScore ?? '—',
    },
    ...standardMetrics<KeywordRowDto>((r) => ({ current: r.metrics })),
  ];
  return <DataTable label="Keywords" columns={columns} getRowId={(r) => r.id} {...tableProps} />;
}

export function LandingPagesTab({ params }: { params: Params }) {
  const f = useFormat();
  const { tableProps } = usePagedEntity<LandingPageRowDto>('/landing-pages', params);
  const columns: DataColumn<LandingPageRowDto>[] = [
    {
      key: 'url',
      header: 'Landing page',
      sortKey: 'url',
      minWidth: 260,
      render: (r) => (
        <Tooltip title={r.url}>
          <Link
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'block',
              maxWidth: 360,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {r.url.replace(/^https?:\/\//, '')}
          </Link>
        </Tooltip>
      ),
    },
    metricColumn('cost', (r) => ({ current: r.metrics })),
    metricColumn('clicks', (r) => ({ current: r.metrics })),
    metricColumn('conversions', (r) => ({ current: r.metrics })),
    metricColumn('conversionRate', (r) => ({ current: r.metrics }), true),
    {
      key: 'sessions',
      header: 'GA4 sessions',
      align: 'right',
      hideOnMobile: true,
      render: (r) => (r.analyticsJoined ? f.number(r.sessions) : '—'),
    },
    {
      key: 'engagementRate',
      header: 'Engagement',
      align: 'right',
      hideOnMobile: true,
      render: (r) => (r.analyticsJoined ? f.percent(r.engagementRate) : '—'),
    },
    {
      key: 'bounceRate',
      header: 'Bounce rate',
      align: 'right',
      render: (r) =>
        r.analyticsJoined ? (
          f.percent(r.bounceRate)
        ) : (
          <Tooltip title="No GA4 property linked for this page">
            <span>—</span>
          </Tooltip>
        ),
    },
  ];
  return <DataTable label="Landing pages" columns={columns} getRowId={(r) => r.id} {...tableProps} />;
}

const BREAKDOWN_METRICS: KpiKey[] = ['cost', 'conversions', 'cpa', 'roas', 'ctr'];

export function BreakdownTab({
  campaignId,
  dimension,
  params,
  label,
}: {
  campaignId: string;
  dimension: 'device' | 'location';
  params: Params;
  label: string;
}) {
  const { organizationId } = useOrg();
  const [metric, setMetric] = useState<KpiKey>('cost');
  const query = useQuery({
    queryKey: ['org', organizationId, 'campaigns', campaignId, 'breakdown', dimension, params],
    queryFn: () => api.get<DimensionRowDto[]>(`/campaigns/${campaignId}/breakdown/${dimension}`, params),
    placeholderData: keepPreviousData,
  });
  const rows = query.data ?? [];
  const metricColumns = [
    ...standardMetrics<DimensionRowDto>((r) => ({ current: r.metrics })),
    metricColumn<DimensionRowDto>('conversionRate', (r) => ({ current: r.metrics }), true),
  ];
  const columns: DataColumn<DimensionRowDto>[] = [
    {
      key: 'label',
      header: label,
      render: (r) => (
        <Typography variant="body2" fontWeight={600}>
          {humanize(r.label)}
        </Typography>
      ),
    },
    ...metricColumns.map((c) => ({ ...c, sortKey: undefined })),
  ];
  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      {rows.length > 0 && (
        <SectionCard
          title={`${METRIC_DEFINITIONS[metric].label} by ${label.toLowerCase()}`}
          actions={
            <ToggleButtonGroup
              size="small"
              exclusive
              value={metric}
              onChange={(_e, v: KpiKey | null) => v && setMetric(v)}
              aria-label="Chart metric"
            >
              {BREAKDOWN_METRICS.map((m) => (
                <ToggleButton key={m} value={m} sx={{ px: 1.25, py: 0.25 }}>
                  {METRIC_DEFINITIONS[m].shortLabel}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          }
        >
          <BreakdownBarChart
            rows={rows.map((r) => ({ label: humanize(r.label), value: r.metrics[metric] }))}
            metric={metric}
          />
        </SectionCard>
      )}
      <Box>
        <DataTable
          label={`Performance by ${label.toLowerCase()}`}
          rows={rows}
          columns={columns}
          getRowId={(r) => r.key}
          loading={query.isPending || query.isFetching}
          error={query.isError ? errorMessage(query.error) : null}
          onRetry={() => void query.refetch()}
        />
      </Box>
    </Stack>
  );
}

export function ChangeHistoryTab({ campaignId }: { campaignId: string }) {
  const f = useFormat();
  const { tableProps } = usePagedEntity<ChangeLogDto>(`/campaigns/${campaignId}/changes`, {}, 'createdAt');
  const columns: DataColumn<ChangeLogDto>[] = [
    { key: 'createdAt', header: 'When', render: (c) => formatDateTime(c.createdAt, f.timeZone) },
    {
      key: 'field',
      header: 'Change',
      render: (c) => (
        <Typography variant="body2" fontWeight={600}>
          {humanize(c.field.replace(/\./g, ' '))}
        </Typography>
      ),
    },
    { key: 'values', header: 'Old → new', render: (c) => `${c.oldValue ?? '—'} → ${c.newValue ?? '—'}` },
    {
      key: 'source',
      header: 'Source',
      hideOnMobile: true,
      render: (c) => (
        <StatusChip tone={c.source === 'USER' ? 'primary' : 'neutral'} label={humanize(c.source)} />
      ),
    },
    { key: 'by', header: 'By', hideOnMobile: true, render: (c) => c.changedBy ?? '—' },
  ];
  return (
    <DataTable
      label="Change history"
      columns={columns}
      getRowId={(c) => c.id}
      {...tableProps}
      sort={undefined}
      onSortChange={undefined}
    />
  );
}
