import { type ActionStatus, RESULT_CLASSIFICATIONS } from '@adpulse/types';
import { type ActionTransitionInput, actionTransitionSchema } from '@adpulse/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { useSnackbar } from 'notistack';
import { useForm } from 'react-hook-form';
import { errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { humanize } from '@/lib/format';
import { ACTION_STATUS_LABELS } from '@/lib/status';
import { useTransitionAction } from './api';

/** Statuses that need extra input before the API accepts the transition. */
export const NEEDS_DETAILS: ReadonlySet<ActionStatus> = new Set(['CANCELLED', 'EVALUATED']);

export interface PendingTransition {
  id: string;
  title: string;
  to: ActionStatus;
  metricLabel?: string | null;
}

export function TransitionDialog({
  pending,
  onClose,
}: {
  pending: PendingTransition | null;
  onClose: () => void;
}) {
  const transition = useTransitionAction();
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, reset } = useForm<ActionTransitionInput>({
    resolver: zodResolver(actionTransitionSchema),
    values: pending
      ? { status: pending.to, cancellationReason: '', actualResult: '', actualValue: null }
      : undefined,
  });
  const close = () => {
    reset();
    onClose();
  };
  const onSubmit = handleSubmit(async (raw) => {
    if (!pending) return;
    try {
      await transition.mutateAsync({ id: pending.id, body: actionTransitionSchema.parse(raw) });
      enqueueSnackbar(`Moved to ${ACTION_STATUS_LABELS[pending.to]}`, { variant: 'success' });
      close();
    } catch (e) {
      enqueueSnackbar(errorMessage(e), { variant: 'error' });
    }
  });
  const to = pending?.to;
  return (
    <Dialog
      open={Boolean(pending)}
      onClose={close}
      maxWidth="sm"
      fullWidth
      aria-labelledby="transition-title"
    >
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogTitle id="transition-title">
          {to === 'EVALUATED' ? 'Evaluate action' : 'Cancel action'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {to === 'EVALUATED'
              ? `Record what happened after “${pending?.title}”. Compare against the baseline over a comparable period and note other changes that may have influenced the result.`
              : `Explain why “${pending?.title}” will not be carried out.`}
          </DialogContentText>
          <Stack spacing={2}>
            {to === 'CANCELLED' && (
              <FormTextField
                control={control}
                name="cancellationReason"
                label="Reason"
                multiline
                minRows={2}
                required
                autoFocus
              />
            )}
            {to === 'EVALUATED' && (
              <>
                <FormTextField control={control} name="resultClassification" label="Result" select required>
                  {RESULT_CLASSIFICATIONS.map((r) => (
                    <MenuItem key={r} value={r}>
                      {humanize(r)}
                    </MenuItem>
                  ))}
                </FormTextField>
                <FormTextField
                  control={control}
                  name="actualValue"
                  label={pending?.metricLabel ? `Actual ${pending.metricLabel}` : 'Actual value'}
                  type="number"
                />
                <FormTextField
                  control={control}
                  name="actualResult"
                  label="What happened"
                  multiline
                  minRows={3}
                  required
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close}>Back</Button>
          <Button
            type="submit"
            variant="contained"
            color={to === 'CANCELLED' ? 'error' : 'primary'}
            disabled={transition.isPending}
          >
            {to === 'EVALUATED' ? 'Save evaluation' : 'Cancel action'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
