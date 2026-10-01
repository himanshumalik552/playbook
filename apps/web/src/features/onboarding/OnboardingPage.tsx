import { zodResolver } from '@hookform/resolvers/zod';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CloudOutlined from '@mui/icons-material/CloudOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import { ORG_ROLES, type OrganizationSettings, ROLE_LABELS } from '@adpulse/types';
import { type CreateOrganizationInput, createOrganizationSchema, emailSchema } from '@adpulse/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { type ReactNode, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api, errorMessage } from '@/api/client';
import { FormTextField } from '@/components/form';
import { LocaleFields } from '@/components/LocaleFields';
import { browserTimezone } from '@/lib/dates';
import { AccountPicker } from '@/features/integrations/AccountPicker';
import { useConnectDemo, useConnectGoogle, useIntegrationsOverview } from '@/features/integrations/api';
import { Logo } from '@/layout/Logo';
import { useAuth } from '@/providers/auth';
import { useOrg } from '@/providers/org';
import { FullPageLoader } from '@/components/FullPageLoader';

const STEPS = ['Organization', 'Team', 'Data source', 'Ad accounts', 'Targets', 'Done'];

function StepActions({
  onBack,
  onSkip,
  children,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  children?: ReactNode;
}) {
  return (
    <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ mt: 3 }}>
      <Box>{onBack && <Button onClick={onBack}>Back</Button>}</Box>
      <Stack direction="row" spacing={1}>
        {onSkip && <Button onClick={onSkip}>Skip for now</Button>}
        {children}
      </Stack>
    </Stack>
  );
}

function OrganizationStep({
  existing,
  onDone,
}: {
  existing: OrganizationSettings | null;
  onDone: (orgId: string) => Promise<void>;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, formState } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: existing?.name ?? '',
      currencyCode: (existing?.currencyCode ?? 'USD') as CreateOrganizationInput['currencyCode'],
      timezone: existing?.timezone ?? browserTimezone(),
    },
  });
  const onSubmit = handleSubmit(async (values) => {
    try {
      const org = existing
        ? await api.patch<OrganizationSettings>('/organizations/current', values)
        : await api.post<OrganizationSettings>('/organizations', values, { skipOrg: true });
      await onDone(org.id);
    } catch (e) {
      enqueueSnackbar(errorMessage(e), { variant: 'error' });
    }
  });
  return (
    <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
      <Typography color="text.secondary">
        Name your workspace and choose how numbers and days are reported. You can change these later.
      </Typography>
      <FormTextField control={control} name="name" label="Organization name" autoFocus required />
      <LocaleFields control={control} currencyName="currencyCode" timezoneName="timezone" />
      <StepActions>
        <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
          {existing ? 'Save and continue' : 'Create organization'}
        </Button>
      </StepActions>
    </Stack>
  );
}

const inviteFormSchema = z.object({
  invites: z.array(z.object({ email: z.union([z.literal(''), emailSchema]), role: z.enum(ORG_ROLES) })),
});
type InviteForm = z.infer<typeof inviteFormSchema>;

function TeamStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, formState } = useForm<InviteForm>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { invites: [{ email: '', role: 'ANALYST' }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'invites' });
  const onSubmit = handleSubmit(async ({ invites }) => {
    const toSend = invites.filter((i) => i.email !== '');
    const results = await Promise.allSettled(toSend.map((i) => api.post('/invitations', i)));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      enqueueSnackbar(`${failed.length} invitation(s) failed: ${errorMessage(failed[0]?.reason)}`, {
        variant: 'error',
      });
      return;
    }
    if (toSend.length > 0) enqueueSnackbar(`Sent ${toSend.length} invitation(s)`, { variant: 'success' });
    onNext();
  });
  return (
    <Stack component="form" spacing={2} onSubmit={onSubmit} noValidate>
      <Typography color="text.secondary">
        Invite colleagues by email. Invitations expire after seven days.
      </Typography>
      {fields.map((field, index) => (
        <Stack
          key={field.id}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ sm: 'flex-start' }}
        >
          <FormTextField control={control} name={`invites.${index}.email`} label="Email" type="email" />
          <FormTextField
            control={control}
            name={`invites.${index}.role`}
            label="Role"
            select
            sx={{ minWidth: 200 }}
            fullWidth={false}
          >
            {ORG_ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </MenuItem>
            ))}
          </FormTextField>
          <IconButton
            aria-label="Remove row"
            onClick={() => remove(index)}
            disabled={fields.length === 1}
            sx={{ mt: { sm: 0.5 } }}
          >
            <DeleteOutline />
          </IconButton>
        </Stack>
      ))}
      <Box>
        <Button
          startIcon={<AddOutlined />}
          onClick={() => append({ email: '', role: 'ANALYST' })}
          disabled={fields.length >= 10}
        >
          Add another
        </Button>
      </Box>
      <StepActions onBack={onBack} onSkip={onNext}>
        <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
          Send and continue
        </Button>
      </StepActions>
    </Stack>
  );
}

function SourceOption({
  icon,
  title,
  text,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Card sx={{ flex: 1, opacity: disabled ? 0.6 : 1 }}>
      <CardActionArea onClick={onClick} disabled={disabled} sx={{ p: 2.5, height: '100%' }}>
        <Stack spacing={1}>
          <Box sx={{ color: 'primary.main' }}>{icon}</Box>
          <Typography variant="h4" component="h3">
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {text}
          </Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

function DataSourceStep({
  onConnected,
  onBack,
}: {
  onConnected: (connectionId: string) => void;
  onBack: () => void;
}) {
  const overview = useIntegrationsOverview();
  const demo = useConnectDemo();
  const google = useConnectGoogle();
  const { enqueueSnackbar } = useSnackbar();
  const existing = overview.data?.connections.find(
    (c) => c.provider === 'GOOGLE_ADS' && c.status !== 'REVOKED',
  );
  const mode = overview.data?.mode;

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        ADPULSE imports data read-only. It never changes campaigns, budgets, bids, keywords or targeting in
        Google Ads.
      </Typography>
      {existing && (
        <Alert severity="success" action={<Button onClick={() => onConnected(existing.id)}>Continue</Button>}>
          {existing.isMock ? 'Demo data source' : 'Google Ads'} is already connected.
        </Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <SourceOption
          icon={<ScienceOutlined />}
          title="Explore with demo data"
          text="Deterministic sample accounts and campaigns. Ideal for evaluating ADPULSE without credentials."
          disabled={mode !== 'mock' || demo.isPending}
          onClick={() =>
            demo.mutate('GOOGLE_ADS', {
              onSuccess: (c) => onConnected(c.id),
              onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
            })
          }
        />
        <SourceOption
          icon={<CloudOutlined />}
          title="Connect Google Ads"
          text="Authorize read-only access with your Google account and pick the accounts to import."
          disabled={!overview.data?.googleConfigured || google.isPending}
          onClick={() =>
            google.mutate('GOOGLE_ADS', {
              onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
            })
          }
        />
      </Stack>
      {overview.data && !overview.data.googleConfigured && (
        <Alert severity="info">
          Google Ads is not configured on this server (INTEGRATION_MODE={overview.data.mode}). See
          docs/GOOGLE_INTEGRATION.md to enable it.
        </Alert>
      )}
      <StepActions onBack={onBack} />
    </Stack>
  );
}

const targetsFormSchema = z.object({
  cpa: z.union([z.literal(''), z.coerce.number().positive('Must be greater than zero').max(1_000_000)]),
  roas: z.union([z.literal(''), z.coerce.number().positive('Must be greater than zero').max(1000)]),
});
type TargetsForm = z.input<typeof targetsFormSchema>;

function TargetsStep({
  currency,
  onNext,
  onBack,
}: {
  currency: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { control, handleSubmit, formState } = useForm<TargetsForm>({
    resolver: zodResolver(targetsFormSchema),
    defaultValues: { cpa: '', roas: '' },
  });
  const onSubmit = handleSubmit(async (raw) => {
    const values = targetsFormSchema.parse(raw);
    try {
      if (values.cpa !== '')
        await api.put('/targets', { scope: 'ORGANIZATION', metric: 'CPA', value: values.cpa });
      if (values.roas !== '')
        await api.put('/targets', { scope: 'ORGANIZATION', metric: 'ROAS', value: values.roas });
      onNext();
    } catch (e) {
      enqueueSnackbar(errorMessage(e), { variant: 'error' });
    }
  });
  return (
    <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
      <Typography color="text.secondary">
        Targets drive alerts and report scorecards. Leave a field empty to use the platform default; you can
        add account and campaign overrides later.
      </Typography>
      <FormTextField
        control={control}
        name="cpa"
        label="Target CPA"
        type="number"
        slotProps={{
          input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> },
        }}
      />
      <FormTextField
        control={control}
        name="roas"
        label="Target ROAS"
        type="number"
        helperText="Conversion value per unit of spend, e.g. 4 means 4x."
      />
      <StepActions onBack={onBack} onSkip={onNext}>
        <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
          Save and continue
        </Button>
      </StepActions>
    </Stack>
  );
}

export function OnboardingPage() {
  const { membership, settingsLoading } = useOrg();
  const [params] = useSearchParams();
  const creatingNew = params.get('new') === '1' || !membership;
  if (!creatingNew && settingsLoading) return <FullPageLoader />;
  return (
    <OnboardingWizard key={creatingNew ? 'new' : membership?.organizationId} creatingNew={creatingNew} />
  );
}

function OnboardingWizard({ creatingNew }: { creatingNew: boolean }) {
  const { user, refreshUser, signOut } = useAuth();
  const { membership, settings, switchOrganization } = useOrg();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<number>(() =>
    creatingNew ? 0 : Math.min(settings?.onboardingStep ?? 0, 4),
  );
  const [connectionId, setConnectionId] = useState<string | null>(null);

  const progress = useMutation({
    mutationFn: (body: { step: number; completed?: boolean }) =>
      api.post<OrganizationSettings>('/organizations/current/onboarding', body),
    onSuccess: (org) => queryClient.setQueryData(['org', org.id, 'settings'], org),
  });

  const goTo = (next: number) => {
    setStep(next);
    progress.mutate({ step: next });
  };

  const finish = async () => {
    await progress.mutateAsync({ step: 5, completed: true });
    await refreshUser();
    navigate('/dashboard', { replace: true });
  };

  const organizationDone = async (orgId: string) => {
    if (creatingNew) {
      await refreshUser();
      switchOrganization(orgId);
    }
    goTo(1);
  };

  const canManage = membership?.role === 'ORGANIZATION_ADMIN' || creatingNew;

  return (
    <Box sx={{ minHeight: '100vh', py: { xs: 3, md: 6 }, px: 2, bgcolor: 'background.default' }}>
      <Box sx={{ maxWidth: 760, mx: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
          <Logo />
          <Stack direction="row" spacing={1}>
            {user && user.memberships.length > 0 && (
              <Button component={RouterLink} to="/dashboard">
                Exit setup
              </Button>
            )}
            <Button
              onClick={async () => {
                await signOut();
                navigate('/sign-in');
              }}
            >
              Sign out
            </Button>
          </Stack>
        </Stack>
        <Typography variant="h1">
          {creatingNew ? 'Set up your organization' : `Finish setting up ${membership?.organizationName}`}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
          Step {step + 1} of {STEPS.length}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={(step / (STEPS.length - 1)) * 100}
          sx={{ mb: 3, height: 6, borderRadius: 3 }}
          aria-label="Setup progress"
        />
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 4, display: { xs: 'none', sm: 'flex' } }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            {STEPS[step]}
          </Typography>
          {!canManage ? (
            <Alert severity="info">
              An organization administrator needs to finish setup. You can already explore the dashboard.
            </Alert>
          ) : (
            <>
              {step === 0 && (
                <OrganizationStep existing={creatingNew ? null : settings} onDone={organizationDone} />
              )}
              {step === 1 && <TeamStep onNext={() => goTo(2)} onBack={() => goTo(0)} />}
              {step === 2 && (
                <DataSourceStep
                  onBack={() => goTo(1)}
                  onConnected={(id) => {
                    setConnectionId(id);
                    goTo(3);
                  }}
                />
              )}
              {step === 3 && (
                <Stack spacing={2}>
                  <Typography color="text.secondary">
                    Select the advertising accounts to import. The last 90 days of history are imported in the
                    background.
                  </Typography>
                  {connectionId ? (
                    <AccountPicker
                      connectionId={connectionId}
                      saveLabel="Import selected accounts"
                      onSaved={() => goTo(4)}
                    />
                  ) : (
                    <ConnectionResolver onResolved={setConnectionId} onMissing={() => goTo(2)} />
                  )}
                  <StepActions onBack={() => goTo(2)} onSkip={() => goTo(4)} />
                </Stack>
              )}
              {step === 4 && (
                <TargetsStep
                  currency={settings?.currencyCode ?? 'USD'}
                  onBack={() => goTo(3)}
                  onNext={() => goTo(5)}
                />
              )}
              {step === 5 && (
                <Stack spacing={2}>
                  <Alert severity="success">
                    Your workspace is ready. Data appears on the dashboard as soon as the first import
                    finishes.
                  </Alert>
                  <StepActions onBack={() => goTo(4)}>
                    <Button variant="contained" onClick={() => void finish()} disabled={progress.isPending}>
                      Go to dashboard
                    </Button>
                  </StepActions>
                </Stack>
              )}
            </>
          )}
        </Card>
      </Box>
    </Box>
  );
}

/** When resuming at the account step, find the active Google Ads connection to pick accounts from. */
function ConnectionResolver({
  onResolved,
  onMissing,
}: {
  onResolved: (id: string) => void;
  onMissing: () => void;
}) {
  const overview = useIntegrationsOverview();
  const connection = overview.data?.connections.find(
    (c) => c.provider === 'GOOGLE_ADS' && c.status !== 'REVOKED',
  );
  if (overview.isPending) return <LinearProgress />;
  if (!connection) {
    return (
      <Alert severity="warning" action={<Button onClick={onMissing}>Choose a data source</Button>}>
        No Google Ads data source is connected yet.
      </Alert>
    );
  }
  return (
    <Button variant="outlined" onClick={() => onResolved(connection.id)}>
      Load accounts from {connection.isMock ? 'demo data source' : (connection.externalEmail ?? 'Google Ads')}
    </Button>
  );
}
