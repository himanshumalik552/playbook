import { TARGET_METRICS, type TargetDto } from '@adpulse/types';
import { type TargetInput, type TargetPayload, targetSchema } from '@adpulse/validation';
import { ConfirmDialog, type DataColumn, DataTable, EmptyState, SectionCard, StatusChip } from '@adpulse/ui';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { useFilterOptions } from '@/hooks/common';
import { formatRelative, useFormat } from '@/lib/format';
import { schemaResolver } from '@/lib/schemaResolver';
import { useOrg } from '@/providers/org';
import { TARGET_METRIC_INFO, type TargetsResponse, unitAdornment, useTargetMutations } from './api';

const EMPTY: TargetInput = {
  scope: 'CAMPAIGN',
  metric: 'CPA',
  value: '',
  adAccountId: null,
  campaignId: null,
};

function OverrideDialog({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: TargetDto | null;
  onClose: () => void;
}) {
  const f = useFormat();
  const options = useFilterOptions();
  const { upsert } = useTargetMutations();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, reset } = useForm<TargetInput, unknown, TargetPayload>({
    resolver: schemaResolver(targetSchema),
    defaultValues: EMPTY,
  });
  const [scope, metric] = useWatch({ control, name: ['scope', 'metric'] });

  useEffect(() => {
    if (open)
      reset(
        target
          ? {
              scope: target.scope,
              metric: target.metric,
              value: target.value,
              adAccountId: target.adAccountId,
              campaignId: target.campaignId,
            }
          : EMPTY,
      );
  }, [open, target, reset]);

  const submit = handleSubmit((values) =>
    upsert.mutate(values, {
      onSuccess: () => {
        enqueueSnackbar('Override saved', { variant: 'success' });
        onClose();
      },
      onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
    }),
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="override-title">
      <form noValidate onSubmit={submit}>
        <DialogTitle id="override-title">{target ? 'Edit override' : 'Add override'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormTextField
              control={control}
              name="scope"
              label="Applies to"
              select
              disabled={Boolean(target)}
            >
              <MenuItem value="AD_ACCOUNT">An ad account</MenuItem>
              <MenuItem value="CAMPAIGN">A campaign</MenuItem>
            </FormTextField>
            {scope === 'AD_ACCOUNT' ? (
              <FormTextField
                control={control}
                name="adAccountId"
                label="Ad account"
                select
                emptyAsNull
                disabled={Boolean(target)}
              >
                {(options.data?.adAccounts ?? []).map((a) => (
                  <MenuItem key={a.value} value={a.value}>
                    {a.label}
                  </MenuItem>
                ))}
              </FormTextField>
            ) : (
              <FormTextField
                control={control}
                name="campaignId"
                label="Campaign"
                select
                emptyAsNull
                disabled={Boolean(target)}
              >
                {(options.data?.campaigns ?? []).map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </FormTextField>
            )}
            <FormTextField control={control} name="metric" label="Metric" select disabled={Boolean(target)}>
              {TARGET_METRICS.map((m) => (
                <MenuItem key={m} value={m}>
                  {TARGET_METRIC_INFO[m].label}
                </MenuItem>
              ))}
            </FormTextField>
            <FormTextField
              control={control}
              name="value"
              label="Value"
              type="number"
              helperText={TARGET_METRIC_INFO[metric].help}
              slotProps={{
                htmlInput: { min: 0, step: 'any' },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">{unitAdornment(metric, f.currencyCode)}</InputAdornment>
                  ),
                },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={upsert.isPending}>
            {upsert.isPending ? 'Saving…' : 'Save override'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function TargetOverrides({ data, loading }: { data: TargetsResponse | undefined; loading: boolean }) {
  const { can } = useOrg();
  const f = useFormat();
  const { enqueueSnackbar } = useSnackbar();
  const { remove } = useTargetMutations();
  const [editing, setEditing] = useState<TargetDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TargetDto | null>(null);
  const overrides = (data?.targets ?? []).filter((t) => t.scope !== 'ORGANIZATION');
  const editable = can('targets:manage');

  const formatValue = (t: TargetDto) => {
    const unit = TARGET_METRIC_INFO[t.metric].unit;
    return unit === 'currency'
      ? f.currency(t.value)
      : unit === 'percent'
        ? f.percent(t.value)
        : `${f.number(t.value, 2)}×`;
  };

  const columns: DataColumn<TargetDto>[] = [
    { key: 'entity', header: 'Applies to', render: (t) => t.campaignName ?? t.adAccountName ?? '—' },
    {
      key: 'scope',
      header: 'Level',
      render: (t) => (
        <StatusChip
          tone={t.scope === 'CAMPAIGN' ? 'primary' : 'info'}
          label={t.scope === 'CAMPAIGN' ? 'Campaign' : 'Account'}
        />
      ),
    },
    { key: 'metric', header: 'Metric', render: (t) => TARGET_METRIC_INFO[t.metric].label },
    { key: 'value', header: 'Value', align: 'right', render: formatValue },
    {
      key: 'updated',
      header: 'Updated',
      hideOnMobile: true,
      render: (t) => `${formatRelative(t.updatedAt)}${t.updatedBy ? ` by ${t.updatedBy}` : ''}`,
    },
    {
      key: 'actions',
      header: <span aria-label="Override actions" />,
      align: 'right',
      render: (t) =>
        editable && (
          <>
            <Tooltip title="Edit">
              <IconButton
                size="small"
                aria-label={`Edit override for ${t.campaignName ?? t.adAccountName ?? ''}`}
                onClick={() => setEditing(t)}
              >
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove">
              <IconButton
                size="small"
                aria-label={`Remove override for ${t.campaignName ?? t.adAccountName ?? ''}`}
                onClick={() => setDeleting(t)}
              >
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        ),
    },
  ];

  return (
    <SectionCard
      title="Account and campaign overrides"
      subtitle="The most specific target wins: campaign, then account, then organization."
      flush
      actions={
        editable && (
          <Button variant="outlined" startIcon={<AddOutlined />} onClick={() => setEditing('new')}>
            Add override
          </Button>
        )
      }
    >
      <DataTable
        label="Target overrides"
        rows={overrides}
        columns={columns}
        getRowId={(t) => t.id}
        loading={loading}
        empty={
          <EmptyState
            title="No overrides"
            description="All accounts and campaigns use the organization targets."
            compact
          />
        }
      />
      <OverrideDialog
        open={editing !== null}
        target={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove override?"
        description="This campaign or account will fall back to the broader target. The change is recorded in the history."
        confirmLabel="Remove"
        destructive
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              enqueueSnackbar('Override removed', { variant: 'info' });
            },
            onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
          })
        }
      />
    </SectionCard>
  );
}
