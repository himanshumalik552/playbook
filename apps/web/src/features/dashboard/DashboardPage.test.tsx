import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';
import { useOrg } from '@/providers/org';
import { byUrl, campaignRow, EMPTY_SUMMARY, FILTER_OPTIONS, overview, page, trend } from '@/test/fixtures';
import { orgValue, renderWithProviders } from '@/test/utils';
import { DashboardPage } from './DashboardPage';

vi.mock('@/providers/org', () => ({ useOrg: vi.fn() }));
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(api.get);
const list = vi.mocked(api.page);

function mockDashboard(routes: Record<string, unknown> = {}) {
  get.mockImplementation(
    byUrl({
      '/dashboard/filters': FILTER_OPTIONS,
      '/dashboard/overview': overview(),
      '/dashboard/summary': EMPTY_SUMMARY,
      ...routes,
    }),
  );
  list.mockImplementation(
    byUrl({
      '/campaigns': page([
        campaignRow(),
        campaignRow({ id: 'cmp_2', name: 'Tents Shopping', openAlerts: 0 }),
      ]),
    }),
  );
}

beforeEach(() => {
  vi.mocked(useOrg).mockReturnValue(orgValue('ANALYST'));
  get.mockReset();
  list.mockReset();
});

describe('DashboardPage', () => {
  it('shows KPIs, charts and top campaigns for the demo data', async () => {
    mockDashboard();
    renderWithProviders(<DashboardPage />, { route: '/dashboard?from=2026-08-29&to=2026-09-27' });
    const kpis = await screen.findByRole('region', { name: 'Key performance indicators' });
    expect(await within(kpis).findByText('$9,600.00')).toBeInTheDocument();
    expect(within(kpis).getByText('$40.00')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Top campaigns by spend' });
    expect(within(table).getByRole('link', { name: 'Brand Search' })).toHaveAttribute(
      'href',
      '/campaigns/cmp_1?from=2026-08-29&to=2026-09-27',
    );
    expect(within(table).getByText('Tents Shopping')).toBeInTheDocument();
    expect(screen.getByText('No open alerts. Rules are evaluated after every sync.')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      '/dashboard/overview',
      expect.objectContaining({ from: '2026-08-29', to: '2026-09-27', compare: true }),
    );
  });

  it('warns when data is stale and when the period has no activity', async () => {
    mockDashboard({
      '/dashboard/overview': overview({
        trend: trend(3, { impressions: 0, cost: 0 }),
        dataFreshness: {
          lastMetricDate: '2026-09-20',
          lastSuccessfulSyncAt: '2026-09-21T06:00:00.000Z',
          isStale: true,
        },
      }),
    });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/data may be out of date/i)).toBeInTheDocument();
    expect(screen.getByText(/no activity in the selected period/i)).toBeInTheDocument();
  });

  it('shows an error state with retry when the overview fails', async () => {
    mockDashboard({ '/dashboard/overview': new ApiError('Metrics store unavailable', 503, 'UNAVAILABLE') });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Metrics store unavailable')).toBeInTheDocument();
    get.mockImplementation(
      byUrl({
        '/dashboard/filters': FILTER_OPTIONS,
        '/dashboard/overview': overview(),
        '/dashboard/summary': EMPTY_SUMMARY,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Key performance indicators' })).toBeInTheDocument();
  });

  it('guides the user to connect a data source when no accounts exist', async () => {
    mockDashboard({ '/dashboard/filters': { ...FILTER_OPTIONS, adAccounts: [], campaigns: [] } });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Connect a data source to see performance')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to integrations' })).toHaveAttribute('href', '/integrations');
  });

  it('only offers a manual sync to roles allowed to trigger it', async () => {
    mockDashboard();
    const { unmount } = renderWithProviders(<DashboardPage />);
    await screen.findByRole('region', { name: 'Key performance indicators' });
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    unmount();
    vi.mocked(useOrg).mockReturnValue(orgValue('MARKETING_MANAGER'));
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeInTheDocument();
  });
});
