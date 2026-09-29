import { hasPermission, type OrganizationSettings, type OrgRole, type Permission } from '@adpulse/types';
import { createAppTheme } from '@adpulse/ui';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

export const TEST_SETTINGS: OrganizationSettings = {
  id: 'org_test_000000000000000001',
  name: 'Northwind Outdoor',
  slug: 'northwind',
  currencyCode: 'USD',
  timezone: 'UTC',
  reportingPreferences: {
    defaultDateRangeDays: 30,
    weekStartsOn: 1,
    compareByDefault: true,
    weeklyReportEnabled: true,
    monthlyReportEnabled: true,
    dailySummaryEnabled: true,
  },
  branding: { primaryColor: '#3949AB', logoUrl: null, reportFooter: null },
  dataRetentionDays: 730,
  onboardingStep: 5,
  onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Value returned by the mocked `useOrg` hook for a member with the given role. */
export function orgValue(
  role: OrgRole | null = 'ANALYST',
  settings: OrganizationSettings | null = TEST_SETTINGS,
) {
  return {
    membership: role
      ? {
          organizationId: TEST_SETTINGS.id,
          organizationName: TEST_SETTINGS.name,
          organizationSlug: TEST_SETTINGS.slug,
          role,
          onboardingCompleted: true,
        }
      : null,
    organizationId: role ? TEST_SETTINGS.id : null,
    role,
    settings,
    settingsLoading: false,
    can: (permission: Permission) => hasPermission(role, permission),
    switchOrganization: () => undefined,
    adAccountId: null,
    setAdAccountId: () => undefined,
  };
}

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [route] });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={createAppTheme('light')}>
        <CssBaseline />
        <SnackbarProvider>
          <RouterProvider router={router} />
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...result, router, queryClient };
}
