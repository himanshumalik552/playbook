import { ALERT_TYPE_LABELS, type AlertDto } from '@adpulse/types';
import { type DataColumn, DataTable, StatusChip } from '@adpulse/ui';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/api/client';
import { formatAlertValue, formatDate, formatRelative, humanize, useFormat } from '@/lib/format';
import { ALERT_STATUS_TONE, SEVERITY_TONE } from '@/lib/status';
import { useOrg } from '@/providers/org';

interface AlertsTableProps {
  params: Record<string, string | number | boolean>;
  onOpen: (alert: AlertDto) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  selection?: { selected: ReadonlySet<string>; onChange: (next: Set<string>) => void };
}

function useAlerts(params: Record<string, string | number | boolean>) {
  const { organizationId } = useOrg();
  return useQuery({
    queryKey: ['org', organizationId, 'alerts', 'list', params],
    queryFn: () => api.page<AlertDto>('/alerts', params),
    placeholderData: keepPreviousData,
  });
}

export function AlertsTable({
  params,
  onOpen,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selection,
}: AlertsTableProps) {
  const f = useFormat();
  const query = useAlerts({ ...params, page, pageSize });
  const columns: DataColumn<AlertDto>[] = [
    {
      key: 'severity',
      header: 'Severity',
      render: (a) => <StatusChip tone={SEVERITY_TONE[a.severity]} label={humanize(a.severity)} />,
    },
    {
      key: 'type',
      header: 'Alert',
      minWidth: 240,
      render: (a) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {ALERT_TYPE_LABELS[a.type]}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {[a.entityName, a.adAccountName].filter(Boolean).join(' · ') || humanize(a.entityType)}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'value',
      header: 'Current vs baseline',
      align: 'right',
      hideOnMobile: true,
      render: (a) => (
        <Stack spacing={0.25} alignItems="flex-end">
          <Typography variant="body2">{formatAlertValue(a.metric, a.currentValue, f)}</Typography>
          <Typography variant="caption" color="text.secondary">
            vs {formatAlertValue(a.metric, a.baselineValue, f)}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'window',
      header: 'Window',
      hideOnMobile: true,
      render: (a) => `${formatDate(a.windowStart, 'd MMM')} – ${formatDate(a.windowEnd, 'd MMM')}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <StatusChip tone={ALERT_STATUS_TONE[a.status]} label={humanize(a.status)} />,
    },
    {
      key: 'assignee',
      header: 'Assignee',
      hideOnMobile: true,
      render: (a) =>
        a.assignee?.name ?? (
          <Typography variant="body2" color="text.secondary">
            Unassigned
          </Typography>
        ),
    },
    { key: 'createdAt', header: 'Raised', hideOnMobile: true, render: (a) => formatRelative(a.createdAt) },
  ];
  return (
    <DataTable
      label="Alerts"
      rows={query.data?.items ?? []}
      columns={columns}
      getRowId={(a) => a.id}
      loading={query.isPending || query.isFetching}
      error={query.isError ? errorMessage(query.error) : null}
      onRetry={() => void query.refetch()}
      onRowClick={onOpen}
      selection={selection}
      pagination={
        query.data
          ? { page, pageSize, total: query.data.meta.total, onPageChange, onPageSizeChange }
          : undefined
      }
    />
  );
}
