import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import {
  CONFIDENCE_LEVELS,
  type KpiKey,
  RECOMMENDATION_STATUSES,
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPES,
  type RecommendationDto,
} from '@adpulse/types';
import { type DataColumn, DataTable, EmptyState, PageHeader, SectionCard, StatusChip } from '@adpulse/ui';
import type { RecommendationInput } from '@adpulse/validation';
import AddOutlined from '@mui/icons-material/AddOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined';
import ViewModuleOutlined from '@mui/icons-material/ViewModuleOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { api, errorMessage, toParams } from '@/api/client';
import { QueryError } from '@/components/QueryState';
import { Can, RequirePermission } from '@/components/RequirePermission';
import { useTableParams } from '@/hooks/useMetricFilters';
import { formatRelative, humanize } from '@/lib/format';
import { CONFIDENCE_TONE, RECOMMENDATION_STATUS_TONE } from '@/lib/status';
import { useOrg } from '@/providers/OrgProvider';
import { ConvertDialog, type ConvertInput, CreateRecommendationDialog, DismissDialog } from './dialogs';

function metricLabel(m: string) {
  return m in METRIC_DEFINITIONS ? METRIC_DEFINITIONS[m as KpiKey].shortLabel : humanize(m);
}

function Decisions({
  rec,
  onApprove,
  onDismiss,
  onConvert,
  busy,
}: {
  rec: RecommendationDto;
  onApprove: () => void;
  onDismiss: () => void;
  onConvert: () => void;
  busy: boolean;
}) {
  const { can } = useOrg();
  if (rec.status === 'CONVERTED' && rec.actionId) {
    return (
      <Button component={RouterLink} to={`/actions?id=${rec.actionId}`} size="small">
        View action
      </Button>
    );
  }
  if (!can('recommendations:decide') || (rec.status !== 'OPEN' && rec.status !== 'APPROVED')) return null;
  return (
    <Stack direction="row" spacing={1}>
      {rec.status === 'OPEN' && (
        <Button size="small" variant="outlined" onClick={onApprove} disabled={busy}>
          Approve
        </Button>
      )}
      {can('actions:create') && (
        <Button size="small" variant="contained" onClick={onConvert} disabled={busy}>
          Convert to action
        </Button>
      )}
      <Button size="small" color="inherit" onClick={onDismiss} disabled={busy}>
        Dismiss
      </Button>
    </Stack>
  );
}

function RecommendationCard({
  rec,
  ...handlers
}: {
  rec: RecommendationDto;
  onApprove: () => void;
  onDismiss: () => void;
  onConvert: () => void;
  busy: boolean;
}) {
  return (
    <Card
      component="article"
      aria-labelledby={`rec-${rec.id}`}
      sx={{ display: 'flex', flexDirection: 'column' }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <StatusChip
            tone={CONFIDENCE_TONE[rec.confidence]}
            label={`${humanize(rec.confidence)} confidence`}
          />
          <StatusChip tone={RECOMMENDATION_STATUS_TONE[rec.status]} label={humanize(rec.status)} />
        </Stack>
        <Typography variant="overline" color="text.secondary">
          {RECOMMENDATION_TYPE_LABELS[rec.type]}
        </Typography>
        <Typography id={`rec-${rec.id}`} variant="h3" component="h2" sx={{ mb: 1 }}>
          {rec.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {rec.rationale}
        </Typography>
        <Box
          component="dl"
          sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5 }}
        >
          {rec.evidence.map((e) => (
            <Box key={e.label} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="caption" color="text.secondary">
                {e.label}
              </Typography>
              <Typography component="dd" variant="caption" fontWeight={600} sx={{ m: 0 }}>
                {e.value}
              </Typography>
            </Box>
          ))}
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
          {rec.affectedMetrics.map((m) => (
            <Chip key={m} size="small" variant="outlined" label={metricLabel(m)} />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
          {rec.campaignId ? (
            <Link component={RouterLink} to={`/campaigns/${rec.campaignId}`}>
              {rec.campaignName}
            </Link>
          ) : (
            (rec.entityName ?? 'Organization-wide')
          )}{' '}
          · {formatRelative(rec.createdAt)}
          {rec.decidedBy ? ` · decided by ${rec.decidedBy.name}` : ''}
        </Typography>
        {rec.dismissalReason && (
          <Typography variant="caption" color="text.secondary" component="p">
            Dismissed: {rec.dismissalReason}
          </Typography>
        )}
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Decisions rec={rec} {...handlers} />
      </CardActions>
    </Card>
  );
}

function RecommendationsContent() {
  const { organizationId } = useOrg();
  const table = useTableParams({ pageSize: 12 });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const view = table.getParam('view') === 'table' ? 'table' : 'cards';
  const status = table.getParam('status') ?? 'OPEN';
  const type = table.getParam('type') ?? '';
  const confidence = table.getParam('confidence') ?? '';
  const [dismissing, setDismissing] = useState<RecommendationDto | null>(null);
  const [converting, setConverting] = useState<RecommendationDto | null>(null);
  const [creating, setCreating] = useState(false);

  const params = toParams({
    status: status === 'ALL' ? '' : status,
    type,
    confidence,
    page: table.page,
    pageSize: table.pageSize,
  });
  const query = useQuery({
    queryKey: ['org', organizationId, 'recommendations', params],
    queryFn: () => api.page<RecommendationDto>('/recommendations', params),
    placeholderData: keepPreviousData,
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'recommendations'] }),
      queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'dashboard', 'summary'] }),
    ]);
  const onError = (e: unknown) => enqueueSnackbar(errorMessage(e), { variant: 'error' });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/recommendations/${id}/approve`),
    onSuccess: async () => {
      await invalidate();
      enqueueSnackbar('Recommendation approved', { variant: 'success' });
    },
    onError,
  });
  const dismiss = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/recommendations/${id}/dismiss`, { reason }),
    onSuccess: async () => {
      setDismissing(null);
      await invalidate();
      enqueueSnackbar('Recommendation dismissed', { variant: 'info' });
    },
    onError,
  });
  const convert = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConvertInput }) =>
      api.post<{ recommendation: RecommendationDto; actionId: string }>(
        `/recommendations/${id}/convert`,
        toParams({
          title: body.title,
          ownerId: body.ownerId,
          priority: body.priority,
          plannedDate: body.plannedDate,
        }),
      ),
    onSuccess: async ({ actionId }) => {
      setConverting(null);
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'actions'] });
      enqueueSnackbar('Action created from recommendation', { variant: 'success' });
      navigate(`/actions?id=${actionId}`);
    },
    onError,
  });
  const create = useMutation({
    mutationFn: (v: RecommendationInput) =>
      api.post('/recommendations', { ...v, campaignId: v.campaignId ?? undefined }),
    onSuccess: async () => {
      setCreating(false);
      await invalidate();
      enqueueSnackbar('Recommendation saved', { variant: 'success' });
    },
    onError,
  });
  const generate = useMutation({
    mutationFn: () => api.post('/recommendations/generate'),
    onSuccess: () =>
      enqueueSnackbar('Generation queued. New recommendations appear shortly.', { variant: 'info' }),
    onError,
  });

  const busy = approve.isPending || dismiss.isPending || convert.isPending;
  const handlers = (rec: RecommendationDto) => ({
    onApprove: () => approve.mutate(rec.id),
    onDismiss: () => setDismissing(rec),
    onConvert: () => setConverting(rec),
    busy,
  });

  const columns: DataColumn<RecommendationDto>[] = [
    {
      key: 'title',
      header: 'Recommendation',
      minWidth: 260,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {r.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {RECOMMENDATION_TYPE_LABELS[r.type]} · {r.campaignName ?? 'Organization-wide'}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'evidence',
      header: 'Key evidence',
      hideOnMobile: true,
      render: (r) => (r.evidence[0] ? `${r.evidence[0].label}: ${r.evidence[0].value}` : '—'),
    },
    {
      key: 'metrics',
      header: 'Affects',
      hideOnMobile: true,
      render: (r) => r.affectedMetrics.map(metricLabel).join(', '),
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (r) => <StatusChip tone={CONFIDENCE_TONE[r.confidence]} label={humanize(r.confidence)} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusChip tone={RECOMMENDATION_STATUS_TONE[r.status]} label={humanize(r.status)} />,
    },
    {
      key: 'decide',
      header: <span aria-label="Decisions" />,
      align: 'right',
      render: (r) => <Decisions rec={r} {...handlers(r)} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Recommendations"
        description="Evidence-based suggestions to review. Approving or converting never changes anything in Google Ads."
        actions={
          <>
            <Can permission="sync:trigger">
              <Button
                variant="outlined"
                startIcon={<AutoAwesomeOutlined />}
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
              >
                Generate
              </Button>
            </Can>
            <Can permission="recommendations:create">
              <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
                Add recommendation
              </Button>
            </Can>
          </>
        }
      />
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        Recommendations reflect patterns observed in your data. They indicate correlation, not proven cause
        and effect — validate before acting.
      </Alert>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ mb: 2 }}
        alignItems={{ md: 'center' }}
      >
        <TextField
          select
          label="Status"
          value={status}
          onChange={(e) => table.setParam('status', e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="ALL">All statuses</MenuItem>
          {RECOMMENDATION_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {humanize(s)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Type"
          value={type}
          onChange={(e) => table.setParam('type', e.target.value || null)}
          sx={{ minWidth: 260 }}
        >
          <MenuItem value="">All types</MenuItem>
          {RECOMMENDATION_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {RECOMMENDATION_TYPE_LABELS[t]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Confidence"
          value={confidence}
          onChange={(e) => table.setParam('confidence', e.target.value || null)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Any</MenuItem>
          {CONFIDENCE_LEVELS.map((c) => (
            <MenuItem key={c} value={c}>
              {humanize(c)}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_e, v: string | null) => v && table.setParam('view', v === 'cards' ? null : v, false)}
          aria-label="View"
        >
          <ToggleButton value="cards" aria-label="Card view">
            <ViewModuleOutlined fontSize="small" />
          </ToggleButton>
          <ToggleButton value="table" aria-label="Table view">
            <TableRowsOutlined fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {view === 'table' ? (
        <SectionCard flush>
          <DataTable
            label="Recommendations"
            rows={query.data?.items ?? []}
            columns={columns}
            getRowId={(r) => r.id}
            loading={query.isPending || query.isFetching}
            error={query.isError ? errorMessage(query.error) : null}
            onRetry={() => void query.refetch()}
            empty={
              <EmptyState
                title="No recommendations match"
                description="Change the filters, or generate recommendations from the latest data."
                compact
              />
            }
            pagination={
              query.data
                ? {
                    page: table.page,
                    pageSize: table.pageSize,
                    total: query.data.meta.total,
                    onPageChange: table.setPage,
                  }
                : undefined
            }
          />
        </SectionCard>
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' },
          }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={260} />
          ))}
        </Box>
      ) : query.data.items.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="No recommendations match"
            description="Change the filters, or generate recommendations from the latest data."
          />
        </SectionCard>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' },
            }}
          >
            {query.data.items.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} {...handlers(rec)} />
            ))}
          </Box>
          <TablePagination
            component="div"
            count={query.data.meta.total}
            page={table.page - 1}
            rowsPerPage={table.pageSize}
            rowsPerPageOptions={[table.pageSize]}
            onPageChange={(_e, p) => table.setPage(p + 1)}
          />
        </>
      )}

      <DismissDialog
        recommendation={dismissing}
        onClose={() => setDismissing(null)}
        pending={dismiss.isPending}
        onSubmit={(reason) => dismissing && dismiss.mutate({ id: dismissing.id, reason })}
      />
      <ConvertDialog
        recommendation={converting}
        onClose={() => setConverting(null)}
        pending={convert.isPending}
        onSubmit={(body) => converting && convert.mutate({ id: converting.id, body })}
      />
      <CreateRecommendationDialog
        open={creating}
        onClose={() => setCreating(false)}
        pending={create.isPending}
        onSubmit={(v) => create.mutate(v)}
      />
    </>
  );
}

export function RecommendationsPage() {
  return (
    <RequirePermission permission="analytics:read">
      <RecommendationsContent />
    </RequirePermission>
  );
}
