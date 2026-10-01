import { CAMPAIGN_STATUSES, type CampaignRowDto } from '@adpulse/types';
import { DataTable, PageHeader, SectionCard } from '@adpulse/ui';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadFile, errorMessage, toParams } from '@/api/client';
import { FilterBar } from '@/components/FilterBar';
import { RequirePermission } from '@/components/RequirePermission';
import { useDebounced } from '@/hooks/common';
import { useMetricFilters, useTableParams } from '@/hooks/useMetricFilters';
import { humanize } from '@/lib/format';
import { useOrg } from '@/providers/org';
import { campaignColumns } from './columns';

function CampaignsContent() {
  const { organizationId } = useOrg();
  const { filters, setFilters, resetFilters, apiParams, activeCount } = useMetricFilters();
  const table = useTableParams({ sortBy: 'cost', sortDir: 'desc' });
  const status = table.getParam('status');
  const [searchInput, setSearchInput] = useState(table.search);
  const debounced = useDebounced(searchInput);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (debounced !== table.search) table.setSearch(debounced);
  }, [debounced, table]);

  const params = { ...apiParams, ...table.params, ...toParams({ status }) };
  const query = useQuery({
    queryKey: ['org', organizationId, 'campaigns', params],
    queryFn: () => api.page<CampaignRowDto>('/campaigns', params),
    placeholderData: keepPreviousData,
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile(
        '/campaigns/export',
        { ...apiParams, ...toParams({ status, search: table.search }) },
        'campaigns.csv',
      );
    } catch (e) {
      enqueueSnackbar(errorMessage(e), { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const detailSearch = `?from=${filters.from}&to=${filters.to}`;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Explore campaign performance with period-over-period comparison. Select a campaign to drill down."
        actions={
          <Button
            variant="outlined"
            startIcon={<FileDownloadOutlined />}
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            Export CSV
          </Button>
        }
      />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        activeCount={activeCount}
        controls={['account', 'device', 'location', 'objective', 'compare']}
      />
      <SectionCard flush>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2 }}>
          <TextField
            label="Search campaigns"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
            label="Status"
            value={status ?? ''}
            onChange={(e) => table.setParam('status', e.target.value || null)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Active and paused</MenuItem>
            {CAMPAIGN_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {humanize(s)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <DataTable
          label="Campaigns"
          rows={query.data?.items ?? []}
          columns={campaignColumns(detailSearch)}
          getRowId={(r) => r.id}
          loading={query.isPending || query.isFetching}
          error={query.isError ? errorMessage(query.error) : null}
          onRetry={() => void query.refetch()}
          sort={{ by: table.sortBy, dir: table.sortDir }}
          onSortChange={table.setSort}
          onRowClick={(r) => navigate(`/campaigns/${r.id}${detailSearch}`)}
          pagination={
            query.data
              ? {
                  page: table.page,
                  pageSize: table.pageSize,
                  total: query.data.meta.total,
                  onPageChange: table.setPage,
                  onPageSizeChange: table.setPageSize,
                }
              : undefined
          }
        />
      </SectionCard>
    </>
  );
}

export function CampaignsPage() {
  return (
    <RequirePermission permission="analytics:read">
      <CampaignsContent />
    </RequirePermission>
  );
}
