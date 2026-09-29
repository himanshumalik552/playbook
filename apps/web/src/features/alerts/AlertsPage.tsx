import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPE_LABELS,
  ALERT_TYPES,
  type AlertSeverity,
  type AlertStatus,
} from '@adpulse/types';
import { EmptyState, PageHeader, SectionCard } from '@adpulse/ui';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import PlaylistPlayRounded from '@mui/icons-material/PlaylistPlayRounded';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { api, errorMessage, toParams } from '@/api/client';
import { Can, RequirePermission } from '@/components/RequirePermission';
import { useMembers } from '@/hooks/common';
import { useTableParams } from '@/hooks/useMetricFilters';
import { humanize } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { AlertDetailDrawer } from './AlertDetailDrawer';
import { AlertsTable } from './AlertsTable';

const DEFAULT_STATUS = 'OPEN,ACKNOWLEDGED';

function MultiSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  format,
}: {
  label: string;
  value: T[];
  options: readonly T[];
  onChange: (v: T[]) => void;
  format: (v: T) => string;
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) =>
        onChange(
          (typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as T[])).filter(
            Boolean,
          ) as T[],
        )
      }
      slotProps={{
        select: {
          multiple: true,
          renderValue: (v) => ((v as T[]).length === 0 ? 'Any' : (v as T[]).map(format).join(', ')),
          displayEmpty: true,
        },
      }}
      sx={{ minWidth: 170 }}
    >
      {options.map((o) => (
        <MenuItem key={o} value={o}>
          {format(o)}
        </MenuItem>
      ))}
    </TextField>
  );
}

function AlertsContent() {
  const { organizationId, adAccountId, can } = useOrg();
  const table = useTableParams({ pageSize: 25 });
  const members = useMembers();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const status = (table.getParam('status') ?? DEFAULT_STATUS).split(',').filter(Boolean) as AlertStatus[];
  const severity = (table.getParam('severity') ?? '').split(',').filter(Boolean) as AlertSeverity[];
  const type = table.getParam('type') ?? '';
  const assigneeId = table.getParam('assignee') ?? '';
  const openId = table.getParam('id');

  const params = toParams({
    status,
    severity,
    type,
    assigneeId,
    adAccountId,
    sortBy: 'severity',
    sortDir: 'desc',
  });

  const bulk = useMutation({
    mutationFn: () =>
      api.post<{ updated: number }>('/alerts/bulk', { ids: [...selected], status: 'ACKNOWLEDGED' }),
    onSuccess: async (r) => {
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'alerts'] });
      enqueueSnackbar(`${r.updated} alert(s) acknowledged`, { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });

  const evaluate = useMutation({
    mutationFn: () => api.post('/alerts/evaluate'),
    onSuccess: () =>
      enqueueSnackbar('Alert evaluation queued. New alerts appear within a minute.', { variant: 'info' }),
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });

  const canBulk = can('alerts:update') && can('alerts:bulk');

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Rule-based signals from your performance data. Each alert explains what was detected and what to investigate."
        actions={
          <>
            {canBulk && selected.size > 0 && (
              <Button
                variant="contained"
                startIcon={<DoneAllRounded />}
                onClick={() => bulk.mutate()}
                disabled={bulk.isPending}
              >
                Acknowledge {selected.size}
              </Button>
            )}
            <Can permission="sync:trigger">
              <Button
                variant="outlined"
                startIcon={<PlaylistPlayRounded />}
                onClick={() => evaluate.mutate()}
                disabled={evaluate.isPending}
              >
                Evaluate now
              </Button>
            </Can>
          </>
        }
      />
      <SectionCard flush>
        <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ p: 2 }}>
          <MultiSelect
            label="Severity"
            value={severity}
            options={ALERT_SEVERITIES}
            format={humanize}
            onChange={(v) => table.setParam('severity', v.join(',') || null)}
          />
          <MultiSelect
            label="Status"
            value={status}
            options={ALERT_STATUSES}
            format={humanize}
            onChange={(v) => table.setParam('status', v.join(','))}
          />
          <TextField
            select
            label="Type"
            value={type}
            onChange={(e) => table.setParam('type', e.target.value || null)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">All types</MenuItem>
            {ALERT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {ALERT_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Assignee"
            value={assigneeId}
            onChange={(e) => table.setParam('assignee', e.target.value || null)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Anyone</MenuItem>
            <MenuItem value="me">Assigned to me</MenuItem>
            {(members.data ?? []).map((m) => (
              <MenuItem key={m.userId} value={m.userId}>
                {m.name}
              </MenuItem>
            ))}
          </TextField>
          {adAccountId && (
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
              Filtered to the account selected in the header.
            </Typography>
          )}
        </Stack>
        {status.length === 0 ? (
          <EmptyState title="Select at least one status" compact />
        ) : (
          <AlertsTable
            params={params}
            page={table.page}
            pageSize={table.pageSize}
            onPageChange={table.setPage}
            onPageSizeChange={table.setPageSize}
            onOpen={(a) => table.setParam('id', a.id, false)}
            selection={canBulk ? { selected, onChange: setSelected } : undefined}
          />
        )}
      </SectionCard>
      <AlertDetailDrawer alertId={openId} onClose={() => table.setParam('id', null, false)} />
    </>
  );
}

export function AlertsPage() {
  return (
    <RequirePermission permission="analytics:read">
      <AlertsContent />
    </RequirePermission>
  );
}
