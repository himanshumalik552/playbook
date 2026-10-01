import {
  ACTION_PRIORITIES,
  CONFIDENCE_LEVELS,
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPES,
  type RecommendationDto,
} from '@adpulse/types';
import {
  type DismissInput,
  dismissSchema,
  type RecommendationInput,
  recommendationSchema,
} from '@adpulse/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormTextField } from '@/components/form';
import { useFilterOptions, useMembers } from '@/hooks/common';
import { humanize } from '@/lib/format';
import { useOrg } from '@/providers/org';

export function DismissDialog({
  recommendation,
  onClose,
  onSubmit,
  pending,
}: {
  recommendation: RecommendationDto | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const { control, handleSubmit, reset } = useForm<DismissInput>({
    resolver: zodResolver(dismissSchema),
    defaultValues: { reason: '' },
  });
  const close = () => {
    reset();
    onClose();
  };
  return (
    <Dialog
      open={Boolean(recommendation)}
      onClose={close}
      maxWidth="sm"
      fullWidth
      aria-labelledby="dismiss-title"
    >
      <Box component="form" onSubmit={handleSubmit((v) => onSubmit(v.reason))} noValidate>
        <DialogTitle id="dismiss-title">Dismiss recommendation</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            “{recommendation?.title}” — explain why it is not being pursued. The reason is kept for audit and
            helps improve future suggestions.
          </DialogContentText>
          <FormTextField
            control={control}
            name="reason"
            label="Reason"
            multiline
            minRows={3}
            required
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="contained" color="error" disabled={pending}>
            Dismiss
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

const convertSchema = z.object({
  title: z.string().trim().min(3, 'Enter a title (min. 3 characters)').max(200),
  ownerId: z.string().nullable(),
  priority: z.enum(ACTION_PRIORITIES),
  plannedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
export type ConvertInput = z.infer<typeof convertSchema>;

export function ConvertDialog({
  recommendation,
  onClose,
  onSubmit,
  pending,
}: {
  recommendation: RecommendationDto | null;
  onClose: () => void;
  onSubmit: (v: ConvertInput) => void;
  pending: boolean;
}) {
  const members = useMembers();
  const { can } = useOrg();
  const { control, handleSubmit } = useForm<ConvertInput>({
    resolver: zodResolver(convertSchema),
    values: recommendation
      ? {
          title: recommendation.title,
          ownerId: null,
          priority: recommendation.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
          plannedDate: null,
        }
      : undefined,
  });
  return (
    <Dialog
      open={Boolean(recommendation)}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="convert-title"
    >
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle id="convert-title">Convert to optimization action</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormTextField control={control} name="title" label="Action title" required />
            <FormTextField control={control} name="priority" label="Priority" select>
              {ACTION_PRIORITIES.map((p) => (
                <MenuItem key={p} value={p}>
                  {humanize(p)}
                </MenuItem>
              ))}
            </FormTextField>
            {can('actions:assign') && (
              <FormTextField control={control} name="ownerId" label="Owner" select emptyAsNull>
                <MenuItem value="">Unassigned</MenuItem>
                {(members.data ?? []).map((m) => (
                  <MenuItem key={m.userId} value={m.userId}>
                    {m.name}
                  </MenuItem>
                ))}
              </FormTextField>
            )}
            <FormTextField
              control={control}
              name="plannedDate"
              label="Planned date"
              type="date"
              emptyAsNull
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            Create action
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function CreateRecommendationDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: RecommendationInput) => void;
  pending: boolean;
}) {
  const options = useFilterOptions();
  const { control, handleSubmit, formState, reset } = useForm<RecommendationInput>({
    resolver: zodResolver(recommendationSchema),
    defaultValues: {
      type: 'REVIEW_EXPENSIVE_SEARCH_TERMS',
      title: '',
      rationale: '',
      evidence: [{ label: '', value: '' }],
      confidence: 'MEDIUM',
      campaignId: null,
    },
  });
  const evidence = useFieldArray({ control, name: 'evidence' });
  const close = () => {
    reset();
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth aria-labelledby="create-rec-title">
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle id="create-rec-title">Record a recommendation</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Base recommendations on observed data and describe the evidence. Avoid claiming causation when
              the data only shows correlation.
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
              <FormTextField control={control} name="type" label="Type" select>
                {RECOMMENDATION_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {RECOMMENDATION_TYPE_LABELS[t]}
                  </MenuItem>
                ))}
              </FormTextField>
              <FormTextField control={control} name="confidence" label="Confidence" select>
                {CONFIDENCE_LEVELS.map((c) => (
                  <MenuItem key={c} value={c}>
                    {humanize(c)}
                  </MenuItem>
                ))}
              </FormTextField>
              <FormTextField control={control} name="campaignId" label="Campaign" select emptyAsNull>
                <MenuItem value="">Organization-wide</MenuItem>
                {(options.data?.campaigns ?? []).map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </FormTextField>
            </Box>
            <FormTextField control={control} name="title" label="Title" required />
            <FormTextField
              control={control}
              name="rationale"
              label="Rationale"
              multiline
              minRows={3}
              required
            />
            <Typography variant="subtitle2">Evidence</Typography>
            {evidence.fields.map((field, index) => (
              <Stack
                key={field.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems={{ sm: 'flex-start' }}
              >
                <FormTextField
                  control={control}
                  name={`evidence.${index}.label`}
                  label="Observation"
                  placeholder="e.g. Mobile CPA (30 days)"
                />
                <FormTextField
                  control={control}
                  name={`evidence.${index}.value`}
                  label="Value"
                  placeholder="e.g. €48.20 vs €31.10 desktop"
                />
                <IconButton
                  aria-label={`Remove evidence ${index + 1}`}
                  onClick={() => evidence.remove(index)}
                  disabled={evidence.fields.length === 1}
                >
                  <DeleteOutline />
                </IconButton>
              </Stack>
            ))}
            {formState.errors.evidence?.root && (
              <FormHelperText error>{formState.errors.evidence.root.message}</FormHelperText>
            )}
            <Box>
              <Button
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => evidence.append({ label: '', value: '' })}
                disabled={evidence.fields.length >= 20}
              >
                Add evidence
              </Button>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            Save recommendation
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
