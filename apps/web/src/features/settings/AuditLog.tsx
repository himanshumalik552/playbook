import type { AuditLogDto } from '@adpulse/types';
import { type DataColumn, DataTable, EmptyState } from '@adpulse/ui';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage, toParams } from '@/api/client';
import { useDebounced } from '@/hooks/common';
import { humanize, useFormat } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';

export function AuditLog() {
  const f = useFormat();
  const { organizationId } = useOrg();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const debounced = useDebounced(search);
  const params = toParams({ page, pageSize, search: debounced, from, to });
  const logs = useQuery({
    queryKey: ['org', organizationId, 'audit-logs', params],
    queryFn: () => api.page<AuditLogDto>('/audit-logs', params),
    placeholderData: keepPreviousData,
  });

  const columns: DataColumn<AuditLogDto>[] = [
    { key: 'when', header: 'When', render: (l) => f.dateTime(l.createdAt) },
    {
      key: 'action',
      header: 'Event',
      render: (l) => (
        <Typography variant="body2" fontWeight={600}>
          {humanize(l.action.replace(/[._]/g, ' '))}
        </Typography>
      ),
    },
    { key: 'actor', header: 'Actor', render: (l) => l.actor?.name ?? 'System' },
    {
      key: 'entity',
      header: 'Entity',
      hideOnMobile: true,
      render: (l) => (l.entityType ? humanize(l.entityType.replace(/([a-z])([A-Z])/g, '$1_$2')) : '—'),
    },
    {
      key: 'details',
      header: 'Details',
      hideOnMobile: true,
      render: (l) => {
        const text = JSON.stringify(l.metadata);
        return text === '{}' ? (
          '—'
        ) : (
          <Tooltip
            title={
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(l.metadata, null, 2)}</pre>
            }
          >
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'help',
              }}
              tabIndex={0}
            >
              {text}
            </Typography>
          </Tooltip>
        );
      },
    },
    { key: 'ip', header: 'IP address', hideOnMobile: true, render: (l) => l.ipAddress ?? '—' },
  ];

  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: 2 }}>
        <TextField
          label="Search events"
          value={search}
          onChange={(e) => resetPage(setSearch)(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <TextField
          label="From"
          type="date"
          value={from}
          onChange={(e) => resetPage(setFrom)(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="date"
          value={to}
          onChange={(e) => resetPage(setTo)(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      <DataTable
        label="Audit log"
        rows={logs.data?.items ?? []}
        columns={columns}
        getRowId={(l) => l.id}
        loading={logs.isPending || logs.isFetching}
        error={logs.isError ? errorMessage(logs.error) : null}
        onRetry={() => void logs.refetch()}
        empty={
          <EmptyState
            title="No matching events"
            description="Security-relevant changes such as sign-ins, role changes and integration updates are recorded here."
            compact
          />
        }
        pagination={
          logs.data
            ? {
                page,
                pageSize,
                total: logs.data.meta.total,
                onPageChange: setPage,
                onPageSizeChange: resetPage(setPageSize),
              }
            : undefined
        }
      />
    </>
  );
}
