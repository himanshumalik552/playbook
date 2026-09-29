import { TARGET_METRICS, type TargetMetric } from '@adpulse/types';
import { targetSchema } from '@adpulse/validation';
import { SectionCard } from '@adpulse/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { errorMessage } from '@/api/client';
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog';
import { useFormat } from '@/lib/format';
import { useOrg } from '@/providers/OrgProvider';
import { TARGET_METRIC_INFO, type TargetsResponse, unitAdornment, useTargetMutations } from './api';

type FormValues = Record<TargetMetric, string>;

export function OrganizationTargets({ data }: { data: TargetsResponse | undefined }) {
  const { can } = useOrg();
  const f = useFormat();
  const { enqueueSnackbar } = useSnackbar();
  const { upsert, remove } = useTargetMutations();
  const editable = can('targets:manage');

  const orgTargets = useMemo(
    () => new Map((data?.targets ?? []).filter((t) => t.scope === 'ORGANIZATION').map((t) => [t.metric, t])),
    [data],
  );
  const initial = useMemo(
    () =>
      Object.fromEntries(
        TARGET_METRICS.map((m) => [m, orgTargets.get(m)?.value.toString() ?? '']),
      ) as FormValues,
    [orgTargets],
  );
  const { control, handleSubmit, reset, setError, formState } = useForm<FormValues>({
    defaultValues: initial,
  });

  useEffect(() => reset(initial), [initial, reset]);

  const onSubmit = handleSubmit(async (values) => {
    let valid = true;
    const changes: (() => Promise<unknown>)[] = [];
    for (const metric of TARGET_METRICS) {
      const raw = values[metric].trim();
      const existing = orgTargets.get(metric);
      if (raw === '') {
        if (existing) changes.push(() => remove.mutateAsync(existing.id));
        continue;
      }
      const parsed = targetSchema.safeParse({
        scope: 'ORGANIZATION',
        metric,
        value: raw,
        adAccountId: null,
        campaignId: null,
      });
      if (!parsed.success) {
        valid = false;
        setError(metric, { message: parsed.error.issues[0]?.message ?? 'Invalid value' });
        continue;
      }
      if (existing?.value !== parsed.data.value) changes.push(() => upsert.mutateAsync(parsed.data));
    }
    if (!valid) return;
    try {
      for (const change of changes) await change();
      enqueueSnackbar(changes.length ? 'Targets saved' : 'No changes to save', {
        variant: changes.length ? 'success' : 'info',
      });
      reset(values);
    } catch (e) {
      enqueueSnackbar(errorMessage(e), { variant: 'error' });
    }
  });

  return (
    <SectionCard
      title="Organization targets"
      subtitle="Apply to every account and campaign unless overridden below. Leave a field empty to use the platform default."
      actions={
        editable && (
          <Button
            variant="contained"
            onClick={() => void onSubmit()}
            disabled={!formState.isDirty || formState.isSubmitting}
          >
            {formState.isSubmitting ? 'Saving…' : 'Save targets'}
          </Button>
        )
      }
    >
      {!data ? (
        <Skeleton variant="rounded" height={80} />
      ) : (
        <Box
          component="form"
          noValidate
          onSubmit={onSubmit}
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
          }}
        >
          {TARGET_METRICS.map((metric) => (
            <Controller
              key={metric}
              name={metric}
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label={TARGET_METRIC_INFO[metric].label}
                  type="number"
                  disabled={!editable}
                  placeholder={f.number(data.defaults[metric], 2)}
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    `${TARGET_METRIC_INFO[metric].help}. Default ${f.number(data.defaults[metric], 2)}.`
                  }
                  slotProps={{
                    htmlInput: { min: 0, step: 'any' },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          {unitAdornment(metric, f.currencyCode)}
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            />
          ))}
        </Box>
      )}
      <UnsavedChangesDialog dirty={formState.isDirty} />
    </SectionCard>
  );
}
