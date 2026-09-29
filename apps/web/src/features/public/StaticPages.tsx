import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { isRouteErrorResponse, Link as RouterLink, useRouteError } from 'react-router-dom';
import { StaticPage } from '@/layout/PublicLayout';

function LegalPage({ title, sections }: { title: string; sections: { heading: string; body: string }[] }) {
  return (
    <StaticPage>
      <Typography variant="h1" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        This is placeholder text for a self-hosted deployment. Replace it with your organization&apos;s
        reviewed legal terms before going live.
      </Alert>
      <Stack spacing={3}>
        {sections.map((s) => (
          <Box key={s.heading} component="section">
            <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
              {s.heading}
            </Typography>
            <Typography color="text.secondary">{s.body}</Typography>
          </Box>
        ))}
      </Stack>
      <Button component={RouterLink} to="/" sx={{ mt: 4 }}>
        Back to ADPULSE
      </Button>
    </StaticPage>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      sections={[
        {
          heading: 'What we process',
          body: 'Account details (name, email), organization settings, and advertising performance data imported read-only from connected Google Ads and Google Analytics properties.',
        },
        {
          heading: 'How credentials are protected',
          body: 'OAuth refresh tokens are encrypted at rest and never exposed to the browser. Sessions use HttpOnly cookies.',
        },
        {
          heading: 'Retention',
          body: 'Organization administrators control the retention period for imported data in Organization settings.',
        },
        {
          heading: 'Your rights',
          body: 'Contact your organization administrator or the operator of this deployment to access, export or delete your data.',
        },
      ]}
    />
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      sections={[
        {
          heading: 'Read-only analytics',
          body: 'ADPULSE reads advertising data to report on performance. It does not modify campaigns, budgets, bids, keywords or targeting in Google Ads.',
        },
        {
          heading: 'Recommendations',
          body: 'Recommendations are based on observed correlations in your data and are suggestions for human review, not guarantees of outcomes.',
        },
        {
          heading: 'Acceptable use',
          body: 'Only connect advertising accounts you are authorized to access, and keep your credentials confidential.',
        },
      ]}
    />
  );
}

function ProblemPage({ code, title, description }: { code: string; title: string; description: string }) {
  return (
    <StaticPage>
      <Stack spacing={2} alignItems="flex-start" sx={{ py: 6 }}>
        <Typography variant="overline" color="primary">
          {code}
        </Typography>
        <Typography variant="h1">{title}</Typography>
        <Typography color="text.secondary">{description}</Typography>
        <Stack direction="row" spacing={1.5}>
          <Button component={RouterLink} to="/dashboard" variant="contained">
            Go to dashboard
          </Button>
          <Button onClick={() => window.history.back()}>Go back</Button>
        </Stack>
      </Stack>
    </StaticPage>
  );
}

export function NotFoundPage() {
  return (
    <ProblemPage
      code="404"
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
    />
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <ProblemPage
      code="Error"
      title="Something went wrong"
      description="An unexpected error occurred while loading this page. Reload the page or try again later."
    />
  );
}
