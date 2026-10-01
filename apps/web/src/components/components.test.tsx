import type { UseQueryResult } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';
import { KpiGrid } from '@/features/dashboard/KpiGrid';
import type { MetricFilters } from '@/hooks/useMetricFilters';
import { useOrg } from '@/providers/org';
import { FILTER_OPTIONS, kpis } from '@/test/fixtures';
import { orgValue, renderWithProviders } from '@/test/utils';
import { FilterBar } from './FilterBar';
import { QueryState } from './QueryState';
import { Can, RequirePermission } from './RequirePermission';

vi.mock('@/providers/org', () => ({ useOrg: vi.fn() }));
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api: { get: vi.fn(), page: vi.fn() },
}));

const mockedOrg = vi.mocked(useOrg);

function fakeQuery<T>(state: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    refetch: vi.fn(),
    ...state,
  } as unknown as UseQueryResult<T>;
}

beforeEach(() => {
  mockedOrg.mockReturnValue(orgValue('ANALYST'));
});

describe('QueryState', () => {
  const render = (query: UseQueryResult<string[]>) =>
    renderWithProviders(
      <QueryState query={query} isEmpty={(d) => d.length === 0} empty={<p>Nothing here</p>}>
        {(data) => <p>Loaded {data.join(', ')}</p>}
      </QueryState>,
    );

  it('shows a skeleton while loading', () => {
    render(fakeQuery({ isPending: true }));
    expect(screen.getByLabelText('Loading')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with retry', async () => {
    const refetch = vi.fn();
    render(
      fakeQuery({ isError: true, error: new ApiError('Database unavailable', 503, 'UNAVAILABLE'), refetch }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Database unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a permission state for 403 responses', () => {
    render(fakeQuery({ isError: true, error: new ApiError('Requires alerts:bulk', 403, 'FORBIDDEN') }));
    expect(screen.getByText(/requires alerts:bulk/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('distinguishes empty from loaded data', () => {
    const { unmount } = render(fakeQuery({ data: [] }));
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    unmount();
    render(fakeQuery({ data: ['a', 'b'] }));
    expect(screen.getByText('Loaded a, b')).toBeInTheDocument();
  });
});

describe('permission gates', () => {
  it('blocks pages and hides controls the role cannot use', () => {
    mockedOrg.mockReturnValue(orgValue('VIEWER'));
    renderWithProviders(
      <>
        <RequirePermission permission="integrations:manage">
          <p>Integration settings</p>
        </RequirePermission>
        <Can permission="actions:create" fallback={<p>Read-only</p>}>
          <button type="button">Create action</button>
        </Can>
      </>,
    );
    expect(screen.queryByText('Integration settings')).not.toBeInTheDocument();
    expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
  });

  it('renders content for permitted roles', () => {
    mockedOrg.mockReturnValue(orgValue('ORGANIZATION_ADMIN'));
    renderWithProviders(
      <RequirePermission permission="integrations:manage">
        <p>Integration settings</p>
      </RequirePermission>,
    );
    expect(screen.getByText('Integration settings')).toBeInTheDocument();
  });
});

describe('KpiGrid', () => {
  const card = (label: string) =>
    screen.getByRole('heading', { name: label }).closest<HTMLElement>('.MuiCard-root')!;

  it('formats values in the organization currency with period comparison', () => {
    renderWithProviders(
      <KpiGrid
        current={kpis()}
        previous={kpis({ cpa: 50 })}
        change={{
          cpa: { absolute: -10, percent: -20, isImprovement: true },
          cost: { absolute: 100, percent: 1.2, isImprovement: null },
        }}
        metrics={['cost', 'cpa', 'roas']}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    const cpa = card('CPA');
    expect(within(cpa).getByText('$40.00')).toBeInTheDocument();
    expect(within(cpa).getByTestId('kpi-change')).toHaveTextContent('-20.0%');
    expect(within(cpa).getByText('(improvement)')).toBeInTheDocument();
    expect(within(cpa).getByText('vs $50.00')).toBeInTheDocument();
    expect(within(card('Spend')).queryByText(/improvement|decline/)).not.toBeInTheDocument();
    expect(within(card('ROAS')).getByText('4.00x')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'About CPA' })).toBeInTheDocument();
  });

  it('marks cards as busy while loading and shows a dash without data', () => {
    const { unmount } = renderWithProviders(<KpiGrid current={null} loading metrics={['cost']} />);
    expect(card('Spend')).toHaveAttribute('aria-busy', 'true');
    unmount();
    renderWithProviders(<KpiGrid current={null} metrics={['cost']} />);
    expect(within(card('Spend')).getByText('—')).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  const filters: MetricFilters = {
    from: '2026-09-21',
    to: '2026-09-27',
    compare: true,
    adAccountId: null,
    campaignIds: [],
    device: null,
    locationId: null,
    objective: null,
  };

  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue(FILTER_OPTIONS);
  });

  it('applies device filters and toggles comparison', async () => {
    const onChange = vi.fn();
    renderWithProviders(<FilterBar filters={filters} onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Device' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mobile' }));
    expect(onChange).toHaveBeenCalledWith({ device: 'MOBILE' });
    await userEvent.click(screen.getByRole('checkbox', { name: /compare to previous period/i }));
    expect(onChange).toHaveBeenCalledWith({ compare: false });
  });

  it('selects campaigns and clears the campaign filter when the account changes', async () => {
    const onChange = vi.fn();
    renderWithProviders(<FilterBar filters={filters} onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Campaigns' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Tents Shopping' }));
    expect(onChange).toHaveBeenCalledWith({ campaignIds: ['cmp_2'] });
    await userEvent.click(screen.getByRole('combobox', { name: 'Account' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Northwind US' }));
    expect(onChange).toHaveBeenCalledWith({ adAccountId: 'acc_1', campaignIds: [] });
  });

  it('rejects inverted custom ranges and offers a reset', async () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    renderWithProviders(
      <FilterBar filters={filters} onChange={onChange} onReset={onReset} activeCount={2} />,
    );
    const from = screen.getByLabelText('From');
    await userEvent.clear(from);
    await userEvent.type(from, '2026-09-30');
    expect(screen.getByText(/pick a valid range/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /clear filters \(2\)/i }));
    expect(onReset).toHaveBeenCalled();
  });
});
