import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import { ALERT_STATUSES, ALERT_TYPE_LABELS, type AlertDto, type KpiKey } from '@adpulse/types';
import { StatusChip } from '@adpulse/ui';
import { type AlertUpdateInput, alertUpdateSchema } from '@adpulse/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import AddTaskOutlined from '@mui/icons-material/AddTaskOutlined';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink } from 'react-router-dom';
import { api, errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { QueryState } from '@/components/QueryState';
import { ActionFormDialog } from '@/features/actions/ActionFormDialog';
import { useMembers } from '@/hooks/common';
import { formatAlertValue, formatDate, humanize, useFormat } from '@/lib/format';
import { ALERT_STATUS_TONE, SEVERITY_TONE } from '@/lib/status';
import { useOrg } from '@/providers/org';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}

function AlertUpdateForm({ alert }: { alert: AlertDto }) {
  const { organizationId } = useOrg();
  const members = useMembers();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, formState } = useForm<AlertUpdateInput>({
    resolver: zodResolver(alertUpdateSchema),
    values: {
      status: alert.status,
      assigneeId: alert.assignee?.id ?? null,
      resolutionNote: alert.resolutionNote ?? '',
    },
  });
  const update = useMutation({
    mutationFn: (values: AlertUpdateInput) =>
      api.patch<AlertDto>(`/alerts/${alert.id}`, {
        status: values.status,
        assigneeId: values.assigneeId,
        ...(values.resolutionNote ? { resolutionNote: values.resolutionNote } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'alerts'] });
      await queryClient.invalidateQueries({ queryKey: ['org', organizationId, 'dashboard', 'summary'] });
      enqueueSnackbar('Alert updated', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });
  return (
    <Stack component="form" spacing={2} onSubmit={handleSubmit((v) => update.mutate(v))} noValidate>
      <FormTextField control={control} name="status" label="Status" select>
        {ALERT_STATUSES.map((s) => (
          <MenuItem key={s} value={s}>
            {humanize(s)}
          </MenuItem>
        ))}
      </FormTextField>
      <FormTextField control={control} name="assigneeId" label="Assignee" select emptyAsNull>
        <MenuItem value="">Unassigned</MenuItem>
        {(members.data ?? []).map((m) => (
          <MenuItem key={m.userId} value={m.userId}>
            {m.name}
          </MenuItem>
        ))}
      </FormTextField>
      <FormTextField
        control={control}
        name="resolutionNote"
        label="Note"
        multiline
        minRows={2}
        helperText="Required when resolving or dismissing."
      />
      <Box>
        <Button type="submit" variant="contained" disabled={update.isPending || !formState.isDirty}>
          Save
        </Button>
      </Box>
    </Stack>
  );
}

export function AlertDetailDrawer({ alertId, onClose }: { alertId: string | null; onClose: () => void }) {
  const { organizationId, can } = useOrg();
  const f = useFormat();
  const [creatingAction, setCreatingAction] = useState(false);
  const query = useQuery({
    queryKey: ['org', organizationId, 'alerts', 'detail', alertId],
    queryFn: () => api.get<AlertDto>(`/alerts/${alertId}`),
    enabled: Boolean(alertId),
  });

  return (
    <Drawer
      anchor="right"
      open={Boolean(alertId)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 480 } } } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Typography variant="h3" component="h2">
          Alert detail
        </Typography>
        <IconButton onClick={onClose} aria-label="Close alert detail">
          <CloseRounded />
        </IconButton>
      </Stack>
      <Divider />
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        <QueryState query={query}>
          {(alert) => (
            <Stack spacing={2.5}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1}>
                  <StatusChip tone={SEVERITY_TONE[alert.severity]} label={humanize(alert.severity)} />
                  <StatusChip tone={ALERT_STATUS_TONE[alert.status]} label={humanize(alert.status)} />
                </Stack>
                <Typography variant="h2" component="p">
                  {ALERT_TYPE_LABELS[alert.type]}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {alert.campaignId ? (
                    <Link component={RouterLink} to={`/campaigns/${alert.campaignId}`}>
                      {alert.entityName}
                    </Link>
                  ) : (
                    (alert.entityName ?? humanize(alert.entityType))
                  )}
                  {alert.adAccountName ? ` · ${alert.adAccountName}` : ''}
                </Typography>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                <Fact label="Current" value={formatAlertValue(alert.metric, alert.currentValue, f)} />
                <Fact
                  label="Baseline / target"
                  value={formatAlertValue(alert.metric, alert.baselineValue, f)}
                />
                <Fact
                  label="Difference"
                  value={
                    alert.differencePercent === null
                      ? formatAlertValue(alert.metric, alert.difference, f)
                      : `${alert.differencePercent > 0 ? '+' : ''}${alert.differencePercent.toFixed(1)}%`
                  }
                />
                <Fact
                  label="Window"
                  value={`${formatDate(alert.windowStart)} – ${formatDate(alert.windowEnd)}`}
                />
              </Box>
              <Box>
                <Typography variant="subtitle2">What was detected</Typography>
                <Typography variant="body2">{alert.explanation}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2">Suggested investigation</Typography>
                <Typography variant="body2">{alert.suggestedInvestigation}</Typography>
              </Box>
              {can('actions:create') && (
                <Box>
                  <Button
                    variant="outlined"
                    startIcon={<AddTaskOutlined />}
                    onClick={() => setCreatingAction(true)}
                  >
                    Create action from alert
                  </Button>
                </Box>
              )}
              <Divider />
              {can('alerts:update') ? (
                <AlertUpdateForm alert={alert} />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Assigned to {alert.assignee?.name ?? 'nobody'}. Your role can view alerts but not change
                  them.
                </Typography>
              )}
              <ActionFormDialog
                open={creatingAction}
                onClose={() => setCreatingAction(false)}
                prefill={{
                  alertId: alert.id,
                  title:
                    `Investigate: ${ALERT_TYPE_LABELS[alert.type]}${alert.entityName ? ` – ${alert.entityName}` : ''}`.slice(
                      0,
                      200,
                    ),
                  description: alert.suggestedInvestigation,
                  hypothesis: alert.explanation,
                  campaignId: alert.campaignId,
                  metricToMonitor: alert.metric in METRIC_DEFINITIONS ? (alert.metric as KpiKey) : null,
                  baselineValue: alert.currentValue,
                }}
              />
            </Stack>
          )}
        </QueryState>
      </Box>
    </Drawer>
  );
}
