import { ALERT_SEVERITIES, type AlertRuleDto, type AlertSeverity } from '@adpulse/types';
import { type DataColumn, DataTable, SectionCard } from '@adpulse/ui';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { errorMessage } from '@/api/client';
import { humanize } from '@/lib/format';
import { useOrg } from '@/providers/org';
import { useAlertRuleMutations, useAlertRules } from './api';

function thresholdLabel(key: string) {
  return humanize(key.replace(/([a-z])([A-Z])/g, '$1_$2'));
}

function ThresholdDialog({ rule, onClose }: { rule: AlertRuleDto | null; onClose: () => void }) {
  const { update } = useAlertRuleMutations();
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rule) setValues(Object.fromEntries(Object.entries(rule.thresholds).map(([k, v]) => [k, String(v)])));
  }, [rule]);

  const errors = Object.fromEntries(
    Object.entries(values).map(([k, v]) => {
      const n = Number(v);
      return [
        k,
        v.trim() === '' || !Number.isFinite(n)
          ? 'Enter a number'
          : n < 0
            ? 'Must be zero or more'
            : n > 1_000_000
              ? 'Too large'
              : null,
      ];
    }),
  );
  const invalid = Object.values(errors).some(Boolean);

  const save = () =>
    rule &&
    update.mutate(
      {
        id: rule.id,
        body: { thresholds: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) },
      },
      {
        onSuccess: () => {
          enqueueSnackbar('Thresholds updated', { variant: 'success' });
          onClose();
        },
        onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
      },
    );

  return (
    <Dialog open={Boolean(rule)} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="threshold-title">
      <DialogTitle id="threshold-title">{rule?.name} thresholds</DialogTitle>
      <DialogContent>
        <DialogContentText variant="body2" sx={{ mb: 2 }}>
          {rule?.description}
        </DialogContentText>
        <Stack spacing={2}>
          {Object.keys(values).map((key) => (
            <TextField
              key={key}
              label={thresholdLabel(key)}
              type="number"
              value={values[key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
              error={Boolean(errors[key])}
              helperText={errors[key] ?? undefined}
              slotProps={{ htmlInput: { min: 0, step: 'any' } }}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={invalid || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function AlertRules() {
  const rules = useAlertRules();
  const { can } = useOrg();
  const { update, reset } = useAlertRuleMutations();
  const { enqueueSnackbar } = useSnackbar();
  const [tuning, setTuning] = useState<AlertRuleDto | null>(null);
  const editable = can('alert-rules:manage');
  const onError = (e: unknown) => enqueueSnackbar(errorMessage(e), { variant: 'error' });

  const columns: DataColumn<AlertRuleDto>[] = [
    {
      key: 'enabled',
      header: 'On',
      width: 64,
      render: (r) => (
        <Switch
          size="small"
          checked={r.enabled}
          disabled={!editable || update.isPending}
          onChange={(e) => update.mutate({ id: r.id, body: { enabled: e.target.checked } }, { onError })}
          slotProps={{ input: { 'aria-label': `${r.enabled ? 'Disable' : 'Enable'} ${r.name}` } }}
        />
      ),
    },
    {
      key: 'name',
      header: 'Rule',
      minWidth: 240,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {r.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {r.description}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (r) => (
        <TextField
          select
          size="small"
          value={r.severity}
          disabled={!editable}
          onChange={(e) =>
            update.mutate({ id: r.id, body: { severity: e.target.value as AlertSeverity } }, { onError })
          }
          slotProps={{ htmlInput: { 'aria-label': `Severity for ${r.name}` } }}
          sx={{ minWidth: 120 }}
        >
          {ALERT_SEVERITIES.map((s) => (
            <MenuItem key={s} value={s}>
              {humanize(s)}
            </MenuItem>
          ))}
        </TextField>
      ),
    },
    {
      key: 'thresholds',
      header: 'Thresholds',
      hideOnMobile: true,
      render: (r) =>
        Object.keys(r.thresholds).length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            None
          </Typography>
        ) : (
          <Typography variant="caption">
            {Object.entries(r.thresholds)
              .map(([k, v]) => `${thresholdLabel(k)}: ${v}`)
              .join(' · ')}
          </Typography>
        ),
    },
    {
      key: 'actions',
      header: <span aria-label="Rule actions" />,
      align: 'right',
      render: (r) =>
        editable && (
          <>
            {Object.keys(r.thresholds).length > 0 && (
              <Tooltip title="Edit thresholds">
                <IconButton
                  size="small"
                  aria-label={`Edit thresholds for ${r.name}`}
                  onClick={() => setTuning(r)}
                >
                  <TuneOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Reset to defaults">
              <IconButton
                size="small"
                aria-label={`Reset ${r.name} to defaults`}
                disabled={reset.isPending}
                onClick={() =>
                  reset.mutate(r.id, {
                    onSuccess: () => enqueueSnackbar(`${r.name} reset to defaults`, { variant: 'info' }),
                    onError,
                  })
                }
              >
                <RestartAltOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        ),
    },
  ];

  return (
    <SectionCard
      title="Alert rules"
      subtitle="Rules run after every sync. Alerts only notify — they never change Google Ads."
      flush
    >
      <DataTable
        label="Alert rules"
        rows={rules.data ?? []}
        columns={columns}
        getRowId={(r) => r.id}
        loading={rules.isPending}
        error={rules.isError ? errorMessage(rules.error) : null}
        onRetry={() => void rules.refetch()}
      />
      <ThresholdDialog rule={tuning} onClose={() => setTuning(null)} />
    </SectionCard>
  );
}
