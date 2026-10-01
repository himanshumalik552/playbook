import type { GeneratedReportDto, ReportTemplateDto } from '@adpulse/types';
import type { ReportTemplateInput } from '@adpulse/validation';
import {
  ConfirmDialog,
  type DataColumn,
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusChip,
} from '@adpulse/ui';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ReplayOutlined from '@mui/icons-material/ReplayOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadFile, errorMessage } from '@/api/client';
import { Can, RequirePermission } from '@/components/RequirePermission';
import { formatBytes, formatDate, humanize, useFormat } from '@/lib/format';
import { REPORT_STATUS_TONE } from '@/lib/status';
import { useOrg } from '@/providers/org';
import { useReportHistory, useReportMutations, useReportTemplates } from './api';
import { ReportGenerator } from './ReportGenerator';
import { TemplateDialog } from './TemplateDialog';

function ReportHistory() {
  const f = useFormat();
  const { can } = useOrg();
  const { enqueueSnackbar } = useSnackbar();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const history = useReportHistory(page, pageSize);
  const { retry } = useReportMutations();
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (r: GeneratedReportDto) => {
    setDownloading(r.id);
    try {
      await downloadFile(
        `/reports/${r.id}/download`,
        undefined,
        `${r.title}.${r.format === 'PDF' ? 'pdf' : 'xlsx'}`,
      );
    } catch (e) {
      enqueueSnackbar(errorMessage(e), { variant: 'error' });
    } finally {
      setDownloading(null);
    }
  };

  const columns: DataColumn<GeneratedReportDto>[] = [
    {
      key: 'title',
      header: 'Report',
      minWidth: 220,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {r.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {humanize(r.frequency)} · {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'format',
      header: 'Format',
      render: (r) => <Chip size="small" variant="outlined" label={r.format === 'EXCEL' ? 'Excel' : 'PDF'} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Stack spacing={0.5}>
          <Tooltip title={r.error ?? ''}>
            <span>
              <StatusChip tone={REPORT_STATUS_TONE[r.status]} label={humanize(r.status)} />
            </span>
          </Tooltip>
          {(r.status === 'QUEUED' || r.status === 'PROCESSING') && (
            <LinearProgress sx={{ width: 80 }} aria-label="Generating" />
          )}
        </Stack>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      hideOnMobile: true,
      render: (r) => formatBytes(r.fileSize),
    },
    {
      key: 'by',
      header: 'Requested by',
      hideOnMobile: true,
      render: (r) => r.requestedBy?.name ?? 'Schedule',
    },
    { key: 'created', header: 'Requested', hideOnMobile: true, render: (r) => f.dateTime(r.createdAt) },
    {
      key: 'actions',
      header: <span aria-label="Report actions" />,
      align: 'right',
      render: (r) =>
        r.status === 'COMPLETED' ? (
          <Button
            size="small"
            startIcon={<DownloadOutlined />}
            onClick={() => void download(r)}
            disabled={downloading === r.id}
          >
            Download
          </Button>
        ) : r.status === 'FAILED' && can('reports:generate') ? (
          <Button
            size="small"
            startIcon={<ReplayOutlined />}
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(r.id, {
                onSuccess: () => enqueueSnackbar('Report re-queued', { variant: 'info' }),
                onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
              })
            }
          >
            Retry
          </Button>
        ) : null,
    },
  ];

  return (
    <DataTable
      label="Report history"
      rows={history.data?.items ?? []}
      columns={columns}
      getRowId={(r) => r.id}
      loading={history.isPending}
      error={history.isError ? errorMessage(history.error) : null}
      onRetry={() => void history.refetch()}
      empty={
        <EmptyState
          title="No reports yet"
          description="Generate a report from the Build tab. Finished files are listed here for download."
          compact
        />
      }
      pagination={
        history.data
          ? {
              page,
              pageSize,
              total: history.data.meta.total,
              onPageChange: setPage,
              onPageSizeChange: (s) => {
                setPageSize(s);
                setPage(1);
              },
            }
          : undefined
      }
    />
  );
}

function ReportTemplates() {
  const templates = useReportTemplates();
  const { saveTemplate, deleteTemplate } = useReportMutations();
  const { enqueueSnackbar } = useSnackbar();
  const [editing, setEditing] = useState<ReportTemplateDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ReportTemplateDto | null>(null);

  const submit = (values: ReportTemplateInput) => {
    const id = editing && editing !== 'new' ? editing.id : undefined;
    const { frequency, ...rest } = values;
    saveTemplate.mutate(
      { id, body: id ? rest : { ...rest, frequency } },
      {
        onSuccess: () => {
          setEditing(null);
          enqueueSnackbar('Template saved', { variant: 'success' });
        },
        onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
      },
    );
  };

  const columns: DataColumn<ReportTemplateDto>[] = [
    {
      key: 'name',
      header: 'Template',
      render: (t) => (
        <Stack spacing={0.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" fontWeight={600}>
              {t.name}
            </Typography>
            {t.isDefault && <Chip size="small" label="Default" />}
          </Stack>
          {t.description && (
            <Typography variant="caption" color="text.secondary">
              {t.description}
            </Typography>
          )}
        </Stack>
      ),
    },
    { key: 'frequency', header: 'Frequency', render: (t) => humanize(t.frequency) },
    {
      key: 'sections',
      header: 'Sections',
      align: 'right',
      hideOnMobile: true,
      render: (t) => t.sections.length,
    },
    {
      key: 'schedule',
      header: 'Scheduled',
      render: (t) => (
        <StatusChip
          tone={t.scheduleEnabled ? 'success' : 'neutral'}
          label={t.scheduleEnabled ? 'On' : 'Off'}
        />
      ),
    },
    {
      key: 'recipients',
      header: 'Recipients',
      hideOnMobile: true,
      render: (t) => (t.recipients.length ? t.recipients.join(', ') : '—'),
    },
    {
      key: 'actions',
      header: <span aria-label="Template actions" />,
      align: 'right',
      render: (t) => (
        <Can permission="reports:schedule">
          <Tooltip title="Edit">
            <IconButton size="small" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
              <EditOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          {!t.isDefault && (
            <Tooltip title="Delete">
              <IconButton size="small" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Can>
      ),
    },
  ];

  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ p: 2, pb: 0 }}>
        <Can permission="reports:schedule">
          <Button variant="outlined" startIcon={<AddOutlined />} onClick={() => setEditing('new')}>
            New template
          </Button>
        </Can>
      </Stack>
      <DataTable
        label="Report templates"
        rows={templates.data ?? []}
        columns={columns}
        getRowId={(t) => t.id}
        loading={templates.isPending}
        error={templates.isError ? errorMessage(templates.error) : null}
        onRetry={() => void templates.refetch()}
      />
      <TemplateDialog
        open={editing !== null}
        template={editing === 'new' ? null : editing}
        pending={saveTemplate.isPending}
        onClose={() => setEditing(null)}
        onSubmit={submit}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete template?"
        description={`"${deleting?.name ?? ''}" will be removed. Reports already generated from it stay in the history.`}
        confirmLabel="Delete"
        destructive
        loading={deleteTemplate.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          deleteTemplate.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              enqueueSnackbar('Template deleted', { variant: 'info' });
            },
            onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
          })
        }
      />
    </>
  );
}

const TABS = ['build', 'history', 'templates'] as const;
type ReportTab = (typeof TABS)[number];

function ReportsContent() {
  const [params, setParams] = useSearchParams();
  const tab: ReportTab = TABS.includes(params.get('tab') as ReportTab)
    ? (params.get('tab') as ReportTab)
    : 'build';
  const setTab = (v: ReportTab) => setParams(v === 'build' ? {} : { tab: v }, { replace: true });

  return (
    <>
      <PageHeader
        title="Reports"
        description="Preview and export client-ready performance reports as PDF or Excel."
      />
      <Tabs
        value={tab}
        onChange={(_e, v: ReportTab) => setTab(v)}
        aria-label="Report sections"
        sx={{ mb: 2 }}
      >
        <Tab value="build" label="Build" />
        <Tab value="history" label="History" />
        <Tab value="templates" label="Templates" />
      </Tabs>
      {tab === 'build' && <ReportGenerator />}
      {tab === 'history' && (
        <SectionCard flush>
          <ReportHistory />
        </SectionCard>
      )}
      {tab === 'templates' && (
        <SectionCard flush>
          <ReportTemplates />
        </SectionCard>
      )}
    </>
  );
}

export function ReportsPage() {
  return (
    <RequirePermission permission="reports:read">
      <ReportsContent />
    </RequirePermission>
  );
}
