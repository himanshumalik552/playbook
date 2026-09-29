import { DEFAULT_BRANDING, DEFAULT_REPORTING_PREFERENCES, type OrganizationSettings } from '@adpulse/types';
import {
  type OrganizationSettingsInput,
  type OrganizationSettingsOutput,
  organizationSettingsSchema,
} from '@adpulse/validation';
import { PageHeader, SectionCard } from '@adpulse/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { LocaleFields } from '@/components/LocaleFields';
import { RequirePermission } from '@/components/RequirePermission';
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog';
import { useOrg } from '@/providers/OrgProvider';
import { ME_QUERY_KEY } from '@/providers/AuthProvider';
import { AuditLog } from './AuditLog';

type BooleanPreference =
  'compareByDefault' | 'dailySummaryEnabled' | 'weeklyReportEnabled' | 'monthlyReportEnabled';

const PREFERENCE_TOGGLES: { key: BooleanPreference; label: string }[] = [
  { key: 'compareByDefault', label: 'Compare with the previous period by default' },
  { key: 'dailySummaryEnabled', label: 'Daily summary report' },
  { key: 'weeklyReportEnabled', label: 'Weekly report' },
  { key: 'monthlyReportEnabled', label: 'Monthly report' },
];

function toForm(s: OrganizationSettings): OrganizationSettingsInput {
  return {
    name: s.name,
    currencyCode: s.currencyCode as OrganizationSettingsInput['currencyCode'],
    timezone: s.timezone,
    dataRetentionDays: s.dataRetentionDays,
    reportingPreferences: { ...DEFAULT_REPORTING_PREFERENCES, ...s.reportingPreferences },
    branding: {
      ...DEFAULT_BRANDING,
      ...s.branding,
      logoUrl: s.branding.logoUrl ?? '',
      reportFooter: s.branding.reportFooter ?? '',
    },
  };
}

function OrganizationForm({ settings }: { settings: OrganizationSettings }) {
  const { organizationId, can } = useOrg();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const editable = can('organization:manage');
  const { control, handleSubmit, reset, formState } = useForm<
    OrganizationSettingsInput,
    unknown,
    OrganizationSettingsOutput
  >({
    resolver: zodResolver(organizationSettingsSchema),
    defaultValues: toForm(settings),
  });
  const primaryColor = useWatch({ control, name: 'branding.primaryColor' });

  useEffect(() => reset(toForm(settings)), [settings, reset]);

  const save = useMutation({
    mutationFn: (v: OrganizationSettingsOutput) =>
      api.patch<OrganizationSettings>('/organizations/current', v),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['org', organizationId, 'settings'], updated);
      reset(toForm(updated));
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      enqueueSnackbar('Organization settings saved', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
  });

  return (
    <Box component="form" noValidate onSubmit={handleSubmit((v) => save.mutate(v))}>
      <Stack spacing={2.5}>
        <SectionCard title="General">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
            <FormTextField control={control} name="name" label="Organization name" disabled={!editable} />
            <LocaleFields
              control={control}
              currencyName="currencyCode"
              timezoneName="timezone"
              disabled={!editable}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            Changing the timezone changes where each reporting day starts and ends; historical metrics are not
            re-imported.
          </Typography>
        </SectionCard>

        <SectionCard title="Reporting preferences">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
            <FormTextField
              control={control}
              name="reportingPreferences.defaultDateRangeDays"
              label="Default date range (days)"
              type="number"
              disabled={!editable}
              slotProps={{ htmlInput: { min: 7, max: 365 } }}
            />
            <Controller
              name="reportingPreferences.weekStartsOn"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  label="Week starts on"
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value) as 0 | 1)}
                  disabled={!editable}
                >
                  <MenuItem value={1}>Monday</MenuItem>
                  <MenuItem value={0}>Sunday</MenuItem>
                </TextField>
              )}
            />
          </Box>
          <Stack sx={{ mt: 1.5 }}>
            {PREFERENCE_TOGGLES.map((t) => (
              <Controller
                key={t.key}
                name={`reportingPreferences.${t.key}`}
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        disabled={!editable}
                      />
                    }
                    label={t.label}
                  />
                )}
              />
            ))}
          </Stack>
        </SectionCard>

        <SectionCard title="Branding" subtitle="Applied to generated PDF and Excel reports.">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <FormTextField
                control={control}
                name="branding.primaryColor"
                label="Accent color"
                disabled={!editable}
              />
              <Box
                aria-hidden
                sx={{
                  width: 40,
                  height: 40,
                  mt: 1,
                  flexShrink: 0,
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : 'transparent',
                }}
              />
            </Stack>
            <FormTextField
              control={control}
              name="branding.logoUrl"
              label="Logo URL"
              placeholder="https://"
              helperText="Public https image, shown on the report cover"
              disabled={!editable}
            />
            <FormTextField
              control={control}
              name="branding.reportFooter"
              label="Report footer"
              disabled={!editable}
            />
          </Box>
        </SectionCard>

        <SectionCard title="Data retention">
          <Box sx={{ maxWidth: 320 }}>
            <FormTextField
              control={control}
              name="dataRetentionDays"
              label="Keep daily metrics for (days)"
              type="number"
              disabled={!editable}
              slotProps={{ htmlInput: { min: 90, max: 3650 } }}
              helperText="Older daily metrics and audit entries are purged by the nightly maintenance job (90–3650 days)."
            />
          </Box>
        </SectionCard>

        {editable && (
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => reset(toForm(settings))} disabled={!formState.isDirty || save.isPending}>
              Discard changes
            </Button>
            <Button type="submit" variant="contained" disabled={!formState.isDirty || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </Stack>
        )}
      </Stack>
      <UnsavedChangesDialog dirty={formState.isDirty} />
    </Box>
  );
}

function SettingsContent() {
  const { settings, can } = useOrg();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'audit' && can('audit:read') ? 'audit' : 'organization';

  return (
    <>
      <PageHeader
        title="Organization settings"
        description="Defaults that apply to dashboards, alerts and reports for everyone in this organization."
      />
      {can('audit:read') && (
        <Tabs
          value={tab}
          onChange={(_e, v: string) => setParams(v === 'audit' ? { tab: 'audit' } : {}, { replace: true })}
          aria-label="Settings sections"
          sx={{ mb: 2 }}
        >
          <Tab value="organization" label="Organization" />
          <Tab value="audit" label="Audit log" />
        </Tabs>
      )}
      {tab === 'audit' ? (
        <SectionCard flush>
          <AuditLog />
        </SectionCard>
      ) : settings ? (
        <OrganizationForm settings={settings} />
      ) : (
        <Skeleton variant="rounded" height={480} />
      )}
    </>
  );
}

export function SettingsPage() {
  return (
    <RequirePermission permission="analytics:read">
      <SettingsContent />
    </RequirePermission>
  );
}
