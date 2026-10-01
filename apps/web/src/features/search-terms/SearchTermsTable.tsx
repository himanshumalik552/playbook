import { SEARCH_TERM_FLAGS, type SearchTermFlag, type SearchTermRowDto } from '@adpulse/types';
import { type DataColumn, DataTable, StatusChip, type StatusTone } from '@adpulse/ui';
import { searchTermReviewSchema } from '@adpulse/validation';
import AddTaskOutlined from '@mui/icons-material/AddTaskOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import SearchRounded from '@mui/icons-material/SearchRounded';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { api, errorMessage, toParams } from '@/api/client';
import { ActionFormDialog, type ActionPrefill } from '@/features/actions/ActionFormDialog';
import { metricColumn } from '@/features/campaigns/columns';
import { useDebounced } from '@/hooks/common';
import { formatDateTime, useFormat } from '@/lib/format';
import { useOrg } from '@/providers/org';

const FLAG_TONE: Record<SearchTermFlag, StatusTone> = {
  NEGATIVE_CANDIDATE: 'error',
  EXPENSIVE: 'warning',
  HIGH_PERFORMER: 'success',
};
const FLAG_LABEL: Record<SearchTermFlag, string> = {
  NEGATIVE_CANDIDATE: 'Negative candidate',
  EXPENSIVE: 'Expensive',
  HIGH_PERFORMER: 'High performer',
};

function ReviewDialog({ term, onClose }: { term: SearchTermRowDto | null; onClose: () => void }) {
  const { organizationId } = useOrg();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [note, setNote] = useState('');
  const reviewed = Boolean(term?.reviewedAt);
  const mutation = useMutation({
    mutationFn: () => {
      const parsed = searchTermReviewSchema.parse({ note });
      return api.patch(`/search-terms/${term?.id}/review`, {
        reviewed: !reviewed,
        ...(parsed.note ? { note: parsed.note } : {}),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'search-terms'] });
      enqueueSnackbar(reviewed ? 'Review cleared' : 'Marked as reviewed', { variant: 'success' });
      setNote('');
      onClose();
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });
  return (
    <Dialog open={Boolean(term)} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="review-title">
      <DialogTitle id="review-title">
        {reviewed ? 'Clear review' : 'Mark search term as reviewed'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          “{term?.term}” — {term?.recommendationReason ?? 'No automated flag.'} Reviewing records your
          decision only; negative keywords are never added automatically. Apply any change yourself in Google
          Ads.
        </DialogContentText>
        {!reviewed && (
          <TextField
            label="Decision notes (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            helperText="e.g. “Add as phrase negative after checking assisted conversions”"
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {reviewed ? 'Clear review' : 'Mark reviewed'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface SearchTermsTableProps {
  baseParams: Record<string, string | number | boolean>;
}

export function SearchTermsTable({ baseParams }: SearchTermsTableProps) {
  const { organizationId, can } = useOrg();
  const f = useFormat();
  const [search, setSearch] = useState('');
  const [flag, setFlag] = useState<SearchTermFlag | ''>('');
  const [reviewed, setReviewed] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ by: string; dir: 'asc' | 'desc' }>({ by: 'cost', dir: 'desc' });
  const [reviewing, setReviewing] = useState<SearchTermRowDto | null>(null);
  const [actionPrefill, setActionPrefill] = useState<ActionPrefill | null>(null);
  const debouncedSearch = useDebounced(search);

  const params = {
    ...baseParams,
    ...toParams({
      search: debouncedSearch,
      flag,
      reviewed,
      page,
      pageSize,
      sortBy: sort.by,
      sortDir: sort.dir,
    }),
  };
  const query = useQuery({
    queryKey: ['org', organizationId, 'search-terms', params],
    queryFn: () => api.page<SearchTermRowDto>('/search-terms', params),
    placeholderData: keepPreviousData,
  });

  const get = (r: SearchTermRowDto) => ({ current: r.metrics });
  const columns: DataColumn<SearchTermRowDto>[] = [
    {
      key: 'term',
      header: 'Search term',
      sortKey: 'term',
      minWidth: 220,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {r.term}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {r.campaignName} · {r.adGroupName}
            {r.keywordText ? ` · kw: ${r.keywordText}` : ''}
          </Typography>
        </Stack>
      ),
    },
    metricColumn('cost', get),
    metricColumn('clicks', get, true),
    metricColumn('conversions', get),
    metricColumn('cpa', get),
    metricColumn('roas', get, true),
    {
      key: 'reason',
      header: 'Recommendation reason',
      minWidth: 220,
      hideOnMobile: true,
      render: (r) =>
        r.flag ? (
          <Stack spacing={0.5} alignItems="flex-start">
            <StatusChip tone={FLAG_TONE[r.flag]} label={FLAG_LABEL[r.flag]} />
            <Typography variant="caption" color="text.secondary">
              {r.recommendationReason}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        ),
    },
    {
      key: 'reviewed',
      header: 'Review',
      render: (r) =>
        r.reviewedAt ? (
          <Tooltip
            title={`${r.reviewedBy ?? 'Someone'} · ${formatDateTime(r.reviewedAt, f.timeZone)}${r.reviewNote ? ` — ${r.reviewNote}` : ''}`}
          >
            <span>
              <StatusChip tone="success" icon={<CheckCircleOutline />} label="Reviewed" />
            </span>
          </Tooltip>
        ) : (
          <StatusChip tone="neutral" label="Not reviewed" />
        ),
    },
    {
      key: 'actions',
      header: <span aria-label="Row actions" />,
      align: 'right',
      render: (r) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          {can('search-terms:review') && (
            <Button size="small" onClick={() => setReviewing(r)}>
              {r.reviewedAt ? 'Clear' : 'Review'}
            </Button>
          )}
          {can('actions:create') && (
            <Tooltip title="Create action">
              <IconButton
                size="small"
                aria-label={`Create action for ${r.term}`}
                onClick={() =>
                  setActionPrefill({
                    title: `Review search term “${r.term.slice(0, 150)}”`,
                    description: `${r.recommendationReason ?? 'Manual review.'} Spend ${f.currency(r.metrics.cost)}, ${f.number(r.metrics.conversions, 1)} conversions in the selected period.`,
                    campaignId: r.campaignId,
                    adGroupId: r.adGroupId,
                    metricToMonitor: 'cpa',
                    baselineValue: r.metrics.cpa,
                  })
                }
              >
                <AddTaskOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: 2 }}>
        <TextField
          label="Search terms"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ flexGrow: 1, maxWidth: 420 }}
        />
        <TextField
          select
          label="Flag"
          value={flag}
          onChange={(e) => {
            setFlag(e.target.value as SearchTermFlag | '');
            setPage(1);
          }}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">All terms</MenuItem>
          {SEARCH_TERM_FLAGS.map((fl) => (
            <MenuItem key={fl} value={fl}>
              {FLAG_LABEL[fl]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Review status"
          value={reviewed}
          onChange={(e) => {
            setReviewed(e.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="false">Not reviewed</MenuItem>
          <MenuItem value="true">Reviewed</MenuItem>
        </TextField>
      </Stack>
      <DataTable
        label="Search terms"
        rows={query.data?.items ?? []}
        columns={columns}
        getRowId={(r) => r.id}
        loading={query.isPending || query.isFetching}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        pagination={
          query.data
            ? {
                page,
                pageSize,
                total: query.data.meta.total,
                onPageChange: setPage,
                onPageSizeChange: (s) => {
                  setPageSize(s);
                  setPage(1);
                },
              }
            : undefined
        }
      />
      <ReviewDialog term={reviewing} onClose={() => setReviewing(null)} />
      <ActionFormDialog
        open={Boolean(actionPrefill)}
        prefill={actionPrefill ?? undefined}
        onClose={() => setActionPrefill(null)}
      />
    </>
  );
}
