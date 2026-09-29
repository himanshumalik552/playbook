import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import { ACTION_PRIORITIES, type ActionDetailDto, type KpiKey, MONITORED_METRICS } from '@adpulse/types';
import { type ActionInput, type ActionPayload, actionSchema } from '@adpulse/validation';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { useId } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { useFilterOptions, useMembers } from '@/hooks/common';
import { humanize } from '@/lib/format';
import { schemaResolver } from '@/lib/schemaResolver';
import { useOrg } from '@/providers/OrgProvider';
import { useCreateAction, useUpdateAction } from './api';

export interface ActionPrefill {
  title?: string;
  description?: string;
  hypothesis?: string;
  campaignId?: string | null;
  adGroupId?: string | null;
  metricToMonitor?: KpiKey | null;
  baselineValue?: number | null;
  alertId?: string;
  recommendationId?: string;
}

interface ActionFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (action: ActionDetailDto) => void;
  prefill?: ActionPrefill;
  /** When set, the dialog edits this action instead of creating one. */
  action?: ActionDetailDto;
}

function toFormValues(prefill: ActionPrefill | undefined, action: ActionDetailDto | undefined): ActionInput {
  return {
    title: action?.title ?? prefill?.title ?? '',
    description: action?.description ?? prefill?.description ?? '',
    hypothesis: action?.hypothesis ?? prefill?.hypothesis ?? '',
    expectedImpact: action?.expectedImpact ?? '',
    priority: action?.priority ?? 'MEDIUM',
    ownerId: action?.owner?.id ?? null,
    campaignId: action?.campaignId ?? prefill?.campaignId ?? null,
    adGroupId: action?.adGroupId ?? prefill?.adGroupId ?? null,
    metricToMonitor: (action?.metricToMonitor ??
      prefill?.metricToMonitor ??
      null) as ActionInput['metricToMonitor'],
    baselineValue: action?.baselineValue ?? prefill?.baselineValue ?? null,
    targetValue: action?.targetValue ?? null,
    plannedDate: action?.plannedDate ?? null,
    evaluationDate: action?.evaluationDate ?? null,
    attachments: action?.attachments ?? [],
  };
}

/**
 * Optimization actions are plans that people carry out in Google Ads themselves; saving one never changes the
 * advertising account.
 */
export function ActionFormDialog({ open, onClose, onSaved, prefill, action }: ActionFormDialogProps) {
  const titleId = useId();
  const { can } = useOrg();
  const members = useMembers();
  const options = useFilterOptions();
  const create = useCreateAction();
  const update = useUpdateAction(action?.id ?? '');
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, formState, reset } = useForm<ActionInput, unknown, ActionPayload>({
    resolver: schemaResolver(actionSchema),
    values: open ? toFormValues(prefill, action) : undefined,
  });
  const attachments = useFieldArray({ control, name: 'attachments' });
  const canAssign = can('actions:assign');

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit(async (payload) => {
    try {
      const body = canAssign ? payload : { ...payload, ownerId: action?.owner?.id ?? null };
      const saved = action
        ? await update.mutateAsync(body)
        : await create.mutateAsync({
            ...body,
            ...(prefill?.alertId ? { alertId: prefill.alertId } : {}),
            ...(prefill?.recommendationId ? { recommendationId: prefill.recommendationId } : {}),
          });
      enqueueSnackbar(action ? 'Action updated' : 'Action created', { variant: 'success' });
      onSaved?.(saved);
      close();
    } catch (e) {
      enqueueSnackbar(errorMessage(e), { variant: 'error' });
    }
  });

  const dateProps = { slotProps: { inputLabel: { shrink: true } } };

  return (
    <Dialog
      open={open}
      onClose={formState.isSubmitting ? undefined : close}
      aria-labelledby={titleId}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle id={titleId}>{action ? 'Edit action' : 'Create optimization action'}</DialogTitle>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2}>
            {!action && (
              <Alert severity="info" variant="outlined">
                Actions are tracked plans. Apply the change yourself in Google Ads; ADPULSE never edits
                campaigns.
              </Alert>
            )}
            <FormTextField control={control} name="title" label="Title" required autoFocus />
            <FormTextField
              control={control}
              name="description"
              label="What will be done"
              multiline
              minRows={2}
            />
            <FormTextField
              control={control}
              name="hypothesis"
              label="Hypothesis"
              multiline
              minRows={2}
              helperText="Why do you expect this to help? State it as a testable assumption."
            />
            <FormTextField control={control} name="expectedImpact" label="Expected impact" />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              <FormTextField control={control} name="priority" label="Priority" select>
                {ACTION_PRIORITIES.map((p) => (
                  <MenuItem key={p} value={p}>
                    {humanize(p)}
                  </MenuItem>
                ))}
              </FormTextField>
              <FormTextField
                control={control}
                name="ownerId"
                label="Owner"
                select
                emptyAsNull
                disabled={!canAssign}
                helperText={canAssign ? undefined : 'Only managers can assign owners'}
              >
                <MenuItem value="">Unassigned</MenuItem>
                {(members.data ?? []).map((m) => (
                  <MenuItem key={m.userId} value={m.userId}>
                    {m.name}
                  </MenuItem>
                ))}
              </FormTextField>
              <FormTextField control={control} name="campaignId" label="Campaign" select emptyAsNull>
                <MenuItem value="">No specific campaign</MenuItem>
                {(options.data?.campaigns ?? []).map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </FormTextField>
              <FormTextField
                control={control}
                name="metricToMonitor"
                label="Metric to monitor"
                select
                emptyAsNull
              >
                <MenuItem value="">None</MenuItem>
                {MONITORED_METRICS.map((m) => (
                  <MenuItem key={m} value={m}>
                    {METRIC_DEFINITIONS[m].label}
                  </MenuItem>
                ))}
              </FormTextField>
              <FormTextField control={control} name="baselineValue" label="Baseline value" type="number" />
              <FormTextField control={control} name="targetValue" label="Target value" type="number" />
              <FormTextField
                control={control}
                name="plannedDate"
                label="Planned date"
                type="date"
                emptyAsNull
                {...dateProps}
              />
              <FormTextField
                control={control}
                name="evaluationDate"
                label="Evaluate on"
                type="date"
                emptyAsNull
                {...dateProps}
              />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Attachments (links)
              </Typography>
              <Stack spacing={1.5}>
                {attachments.fields.map((field, index) => (
                  <Stack
                    key={field.id}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems={{ sm: 'flex-start' }}
                  >
                    <FormTextField control={control} name={`attachments.${index}.name`} label="Name" />
                    <FormTextField
                      control={control}
                      name={`attachments.${index}.url`}
                      label="https:// link"
                    />
                    <IconButton
                      aria-label={`Remove attachment ${index + 1}`}
                      onClick={() => attachments.remove(index)}
                    >
                      <DeleteOutline />
                    </IconButton>
                  </Stack>
                ))}
                <Box>
                  <Button
                    size="small"
                    startIcon={<AddOutlined />}
                    onClick={() => attachments.append({ name: '', url: '' })}
                    disabled={attachments.fields.length >= 20}
                  >
                    Add link
                  </Button>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={close} disabled={formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
            {action ? 'Save changes' : 'Create action'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
