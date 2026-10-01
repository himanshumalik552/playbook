import { REPORT_FORMATS, REPORT_FREQUENCIES, type ReportFormat, type ReportFrequency } from '@adpulse/types';
import { type ReportRequestInput, reportRequestSchema } from '@adpulse/validation';
import { SectionCard } from '@adpulse/ui';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import { zodResolver } from '@hookform/resolvers/zod';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useSnackbar } from 'notistack';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { errorMessage, toParams } from '@/api/client';
import { FormTextField } from '@/components/form';
import { QueryError } from '@/components/QueryState';
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog';
import { useFilterOptions } from '@/hooks/common';
import { humanize } from '@/lib/format';
import { lastCompleteDay } from '@/lib/dates';
import { useOrg } from '@/providers/org';
import { useReportMutations, useReportPreview, useReportTemplates } from './api';
import { defaultReportPeriod } from './period';
import { ReportPreview } from './ReportPreview';

const FORMAT_LABELS: Record<ReportFormat, string> = { PDF: 'PDF document', EXCEL: 'Excel workbook' };

export function ReportGenerator() {
  const { settings, can, adAccountId } = useOrg();
  const { enqueueSnackbar } = useSnackbar();
  const timeZone = settings?.timezone ?? 'UTC';
  const weekStartsOn = settings?.reportingPreferences.weekStartsOn ?? 1;
  const templates = useReportTemplates();
  const options = useFilterOptions();
  const { generate } = useReportMutations();
  const [previewParams, setPreviewParams] = useState<Record<string, string | number | boolean> | null>(null);
  const preview = useReportPreview(previewParams);

  const initial = useMemo<ReportRequestInput>(() => {
    const period = defaultReportPeriod('WEEKLY', timeZone, weekStartsOn);
    return {
      templateId: null,
      frequency: 'WEEKLY',
      format: 'PDF',
      title: 'Weekly performance report',
      ...period,
      adAccountId: adAccountId ?? null,
      campaignIds: [],
      commentary: '',
    };
  }, [timeZone, weekStartsOn, adAccountId]);

  const form = useForm<ReportRequestInput>({
    resolver: zodResolver(reportRequestSchema),
    defaultValues: initial,
  });
  const { control, handleSubmit, setValue, reset, formState } = form;
  const [accountId, campaignIds, commentary] = useWatch({
    control,
    name: ['adAccountId', 'campaignIds', 'commentary'],
  });
  const maxDate = lastCompleteDay(timeZone);

  const campaigns = (options.data?.campaigns ?? []).filter((c) => !accountId || c.adAccountId === accountId);

  const applyFrequency = (frequency: ReportFrequency) => {
    const period = defaultReportPeriod(frequency, timeZone, weekStartsOn);
    setValue('frequency', frequency, { shouldDirty: true });
    setValue('from', period.from, { shouldDirty: true });
    setValue('to', period.to, { shouldDirty: true, shouldValidate: true });
    const title = form.getValues('title');
    if (!title || /^(Daily|Weekly|Monthly|Custom) performance report$/.test(title)) {
      setValue('title', `${humanize(frequency)} performance report`, { shouldDirty: true });
    }
  };

  const applyTemplate = (templateId: string | null) => {
    setValue('templateId', templateId, { shouldDirty: true });
    const template = templates.data?.find((t) => t.id === templateId);
    if (template) {
      applyFrequency(template.frequency);
      setValue('title', template.name, { shouldDirty: true });
    }
  };

  const visibleCampaignIds = (v: ReportRequestInput) =>
    v.campaignIds.filter((id) => campaigns.some((c) => c.value === id));
  const scope = (v: ReportRequestInput) =>
    toParams({
      frequency: v.frequency,
      from: v.from,
      to: v.to,
      adAccountId: v.adAccountId,
      campaignIds: visibleCampaignIds(v),
    });

  const onPreview = handleSubmit((v) => setPreviewParams(scope(v)));
  const onGenerate = handleSubmit(async (v) => {
    try {
      await generate.mutateAsync({
        ...scope(v),
        campaignIds: visibleCampaignIds(v).length ? visibleCampaignIds(v) : undefined,
        format: v.format,
        title: v.title,
        templateId: v.templateId ?? undefined,
        commentary: can('reports:commentary') && v.commentary ? v.commentary : undefined,
      });
      enqueueSnackbar(`${FORMAT_LABELS[v.format]} queued. It appears on the History tab when ready.`, {
        variant: 'success',
      });
      reset(v);
    } catch (e) {
      enqueueSnackbar(errorMessage(e), { variant: 'error' });
    }
  });

  return (
    <Stack spacing={2.5}>
      <SectionCard
        title="Build a report"
        subtitle="Reports cover completed days only, in the organization's reporting timezone."
      >
        <Box
          component="form"
          noValidate
          onSubmit={onGenerate}
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          }}
        >
          <Controller
            name="templateId"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="Template"
                value={field.value ?? ''}
                onChange={(e) => applyTemplate(e.target.value || null)}
              >
                <MenuItem value="">No template (all sections)</MenuItem>
                {(templates.data ?? []).map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="frequency"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="Period type"
                value={field.value}
                onChange={(e) => applyFrequency(e.target.value as ReportFrequency)}
              >
                {REPORT_FREQUENCIES.map((f) => (
                  <MenuItem key={f} value={f}>
                    {humanize(f)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <FormTextField
            control={control}
            name="from"
            label="From"
            type="date"
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: maxDate } }}
          />
          <FormTextField
            control={control}
            name="to"
            label="To"
            type="date"
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: maxDate } }}
          />
          <FormTextField control={control} name="title" label="Title" sx={{ gridColumn: { lg: 'span 2' } }} />
          <FormTextField control={control} name="adAccountId" label="Ad account" select emptyAsNull>
            <MenuItem value="">All accounts</MenuItem>
            {(options.data?.adAccounts ?? []).map((a) => (
              <MenuItem key={a.value} value={a.value}>
                {a.label}
              </MenuItem>
            ))}
          </FormTextField>
          <FormTextField control={control} name="format" label="Format" select>
            {REPORT_FORMATS.map((f) => (
              <MenuItem key={f} value={f}>
                {FORMAT_LABELS[f]}
              </MenuItem>
            ))}
          </FormTextField>
          <Controller
            name="campaignIds"
            control={control}
            render={({ field, fieldState }) => (
              <Autocomplete
                multiple
                options={campaigns}
                value={campaigns.filter((c) => campaignIds.includes(c.value))}
                onChange={(_e, v) => field.onChange(v.map((c) => c.value))}
                getOptionLabel={(o) => o.label}
                isOptionEqualToValue={(a, b) => a.value === b.value}
                limitTags={3}
                sx={{ gridColumn: '1 / -1' }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Campaigns"
                    placeholder={campaignIds.length ? '' : 'All campaigns'}
                    error={Boolean(fieldState.error)}
                    helperText={fieldState.error?.message}
                  />
                )}
              />
            )}
          />
          {can('reports:commentary') && (
            <FormTextField
              control={control}
              name="commentary"
              label="Executive commentary"
              multiline
              minRows={3}
              helperText="Optional. Appears at the top of the report. Describe what you observed; avoid claiming causes the data cannot prove."
              sx={{ gridColumn: '1 / -1' }}
            />
          )}
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ gridColumn: '1 / -1' }}>
            <Button
              variant="outlined"
              startIcon={<VisibilityOutlined />}
              onClick={() => void onPreview()}
              disabled={preview.isFetching}
            >
              {preview.isFetching ? 'Loading preview…' : 'Preview'}
            </Button>
            {can('reports:generate') && (
              <Button
                type="submit"
                variant="contained"
                startIcon={<DescriptionOutlined />}
                disabled={generate.isPending}
              >
                {generate.isPending ? 'Queuing…' : 'Generate'}
              </Button>
            )}
          </Stack>
        </Box>
      </SectionCard>
      {preview.isError && <QueryError error={preview.error} onRetry={() => void preview.refetch()} />}
      {preview.data && (
        <ReportPreview data={{ ...preview.data, commentary: commentary || preview.data.commentary }} />
      )}
      <UnsavedChangesDialog dirty={formState.isDirty && Boolean(commentary)} />
    </Stack>
  );
}
