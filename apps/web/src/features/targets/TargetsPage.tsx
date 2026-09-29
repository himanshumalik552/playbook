import type { ChangeLogDto } from '@adpulse/types';
import { type DataColumn, DataTable, EmptyState, PageHeader, SectionCard, StatusChip } from '@adpulse/ui';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { QueryError } from '@/components/QueryState';
import { RequirePermission } from '@/components/RequirePermission';
import { humanize, useFormat } from '@/lib/format';
import { AlertRules } from './AlertRules';
import { useTargetHistory, useTargets } from './api';
import { OrganizationTargets } from './OrganizationTargets';
import { TargetOverrides } from './TargetOverrides';

function TargetHistory() {
  const f = useFormat();
  const [page, setPage] = useState(1);
  const history = useTargetHistory(page, 10);
  const columns: DataColumn<ChangeLogDto>[] = [
    { key: 'when', header: 'When', render: (c) => f.dateTime(c.createdAt) },
    {
      key: 'field',
      header: 'Change',
      render: (c) => (
        <Typography variant="body2" fontWeight={600}>
          {humanize(c.field.replace(/\./g, ' '))}
        </Typography>
      ),
    },
    {
      key: 'values',
      header: 'Old → new',
      render: (c) => `${c.oldValue ?? '—'} → ${c.newValue ?? 'removed'}`,
    },
    {
      key: 'entity',
      header: 'Level',
      hideOnMobile: true,
      render: (c) => <StatusChip tone="neutral" label={humanize(c.entityType)} />,
    },
    { key: 'by', header: 'By', render: (c) => c.changedBy ?? 'System' },
  ];
  return (
    <SectionCard title="Change history" subtitle="Every target change is recorded for auditing." flush>
      <DataTable
        label="Target change history"
        rows={history.data?.items ?? []}
        columns={columns}
        getRowId={(c) => c.id}
        loading={history.isPending}
        error={history.isError ? errorMessage(history.error) : null}
        onRetry={() => void history.refetch()}
        empty={<EmptyState title="No changes yet" description="Target edits will appear here." compact />}
        pagination={
          history.data
            ? { page, pageSize: 10, total: history.data.meta.total, onPageChange: setPage }
            : undefined
        }
      />
    </SectionCard>
  );
}

function TargetsContent() {
  const targets = useTargets();
  return (
    <>
      <PageHeader
        title="Targets and rules"
        description="Define what good performance looks like. Alerts and reports compare actual results with these targets."
      />
      {targets.isError ? (
        <QueryError error={targets.error} onRetry={() => void targets.refetch()} />
      ) : (
        <Stack spacing={2.5}>
          <OrganizationTargets data={targets.data} />
          <TargetOverrides data={targets.data} loading={targets.isPending} />
          <AlertRules />
          <TargetHistory />
        </Stack>
      )}
    </>
  );
}

export function TargetsPage() {
  return (
    <RequirePermission permission="analytics:read">
      <TargetsContent />
    </RequirePermission>
  );
}
