import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../src/ConfirmDialog';
import { DataTable, type DataColumn } from '../src/DataTable';
import { KpiCard } from '../src/KpiCard';
import { PageHeader, SectionCard } from '../src/layout';
import { EmptyState, ErrorState, ForbiddenState } from '../src/states';
import { StatusChip } from '../src/StatusChip';
import { createAppTheme } from '../src/theme';
import { renderWithTheme } from './render';

interface Row {
  id: string;
  name: string;
  cost: number;
}

const columns: DataColumn<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name, sortKey: 'name' },
  {
    key: 'cost',
    header: 'Cost',
    render: (r) => r.cost.toFixed(2),
    sortKey: 'cost',
    align: 'right',
    headerTooltip: 'Total spend',
  },
];

const rows: Row[] = [
  { id: 'a', name: 'Brand', cost: 10 },
  { id: 'b', name: 'Generic', cost: 20 },
];

describe('createAppTheme', () => {
  it('builds light and dark palettes', () => {
    expect(createAppTheme('light').palette.mode).toBe('light');
    expect(createAppTheme('dark').palette.background.default).toBe('#0E1324');
  });
});

describe('KpiCard', () => {
  it('renders value, change and screen-reader judgement', () => {
    renderWithTheme(
      <KpiCard
        label="CPA"
        value="€12.50"
        description="Cost per conversion."
        formula="Cost / Conversions"
        change={{ label: '-8.0%', direction: 'down', isImprovement: true }}
        previousValue="€13.59"
      />,
    );
    expect(screen.getByText('€12.50')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-change')).toHaveTextContent('-8.0%(improvement)');
    expect(screen.getByText('vs €13.59')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'About CPA' })).toBeInTheDocument();
  });

  it('shows skeletons while loading and hides values', () => {
    const { container } = renderWithTheme(<KpiCard label="Spend" value="€100" loading />);
    expect(screen.queryByText('€100')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(2);
  });

  it('omits judgement for neutral metrics', () => {
    renderWithTheme(
      <KpiCard
        label="Spend"
        value="€100"
        change={{ label: '+5.0%', direction: 'up', isImprovement: null }}
      />,
    );
    expect(screen.getByTestId('kpi-change')).toHaveTextContent('+5.0%');
    expect(screen.queryByText('(improvement)')).not.toBeInTheDocument();
  });
});

describe('DataTable', () => {
  it('renders rows and toggles sort direction', async () => {
    const onSortChange = vi.fn();
    renderWithTheme(
      <DataTable
        label="Campaigns"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        sort={{ by: 'cost', dir: 'desc' }}
        onSortChange={onSortChange}
      />,
    );
    const table = screen.getByRole('table', { name: 'Campaigns' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: /Cost/ }));
    expect(onSortChange).toHaveBeenCalledWith({ by: 'cost', dir: 'asc' });
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ by: 'name', dir: 'desc' });
  });

  it('shows the loading skeleton, empty and error states', async () => {
    const onRetry = vi.fn();
    const { rerender, container } = renderWithTheme(
      <DataTable label="T" rows={[]} columns={columns} getRowId={(r) => r.id} loading />,
    );
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);

    rerender(<DataTable label="T" rows={[]} columns={columns} getRowId={(r) => r.id} />);
    expect(screen.getByText('No results')).toBeInTheDocument();

    rerender(
      <DataTable
        label="T"
        rows={[]}
        columns={columns}
        getRowId={(r) => r.id}
        error="Network down"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('supports row click via keyboard and selection', async () => {
    const onRowClick = vi.fn();
    const onChange = vi.fn();
    renderWithTheme(
      <DataTable
        label="T"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={onRowClick}
        selection={{ selected: new Set(['a']), onChange, isSelectable: (id) => id !== 'b' }}
      />,
    );
    const brandRow = screen.getByText('Brand').closest('tr') as HTMLElement;
    brandRow.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select row a' }));
    expect(onChange).toHaveBeenLastCalledWith(new Set());
    expect(screen.getByRole('checkbox', { name: 'Select row b' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(onChange).toHaveBeenLastCalledWith(new Set());
  });

  it('paginates with 1-based pages', async () => {
    const onPageChange = vi.fn();
    renderWithTheme(
      <DataTable
        label="T"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        pagination={{ page: 1, pageSize: 2, total: 5, onPageChange }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe('state components', () => {
  it('renders empty, error and forbidden states', () => {
    renderWithTheme(
      <>
        <EmptyState title="No alerts" description="All clear." />
        <ErrorState title="Failed" />
        <ForbiddenState />
      </>,
    );
    expect(screen.getByText('No alerts')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getByText('You do not have access to this')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('confirms and cancels', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderWithTheme(
      <ConfirmDialog
        open
        title="Remove member"
        description="This cannot be undone."
        confirmLabel="Remove"
        destructive
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Remove member' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('layout and chips', () => {
  it('renders page header, section card and status chip', () => {
    renderWithTheme(
      <>
        <PageHeader
          title="Alerts"
          description="Open issues"
          actions={<button type="button">Export</button>}
        />
        <SectionCard id="trend" title="Trend" subtitle="Daily">
          content
        </SectionCard>
        <StatusChip tone="warning" label="Medium" />
        <StatusChip tone="neutral" label="Draft" />
      </>,
      'dark',
    );
    expect(screen.getByRole('heading', { name: 'Alerts' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Trend' })).toHaveTextContent('content');
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });
});
