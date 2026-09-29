import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import type { KeyboardEvent, ReactNode } from 'react';
import { visuallyHidden } from './a11y';
import { EmptyState, ErrorState } from './states';

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** When set, the column header toggles sorting by this key. */
  sortKey?: string;
  width?: number | string;
  minWidth?: number;
  headerTooltip?: string;
  /** Hidden below the md breakpoint to keep mobile tables readable. */
  hideOnMobile?: boolean;
}

export interface DataTableSort {
  by: string;
  dir: 'asc' | 'desc';
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export interface DataTableSelection {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  isSelectable?: (id: string) => boolean;
}

export interface DataTableProps<T> {
  label: string;
  rows: readonly T[];
  columns: readonly DataColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  pagination?: DataTablePagination;
  onRowClick?: (row: T) => void;
  selection?: DataTableSelection;
  size?: 'small' | 'medium';
  skeletonRows?: number;
  maxHeight?: number;
}

const mobileHidden = { display: { xs: 'none', md: 'table-cell' } } as const;

export function DataTable<T>({
  label,
  rows,
  columns,
  getRowId,
  loading = false,
  error = null,
  onRetry,
  empty,
  sort,
  onSortChange,
  pagination,
  onRowClick,
  selection,
  size = 'small',
  skeletonRows = 6,
  maxHeight,
}: DataTableProps<T>) {
  const columnCount = columns.length + (selection ? 1 : 0);
  const ids = rows.map(getRowId).filter((id) => selection?.isSelectable?.(id) ?? true);
  const allSelected =
    selection !== undefined && ids.length > 0 && ids.every((id) => selection.selected.has(id));
  const someSelected = selection !== undefined && ids.some((id) => selection.selected.has(id));

  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const id of ids) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    selection.onChange(next);
  };

  const toggle = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };

  const onSort = (key: string) => {
    if (!onSortChange) return;
    const dir = sort?.by === key && sort.dir === 'desc' ? 'asc' : 'desc';
    onSortChange({ by: key, dir });
  };

  const onRowKey = (event: KeyboardEvent, row: T) => {
    if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onRowClick(row);
    }
  };

  let body: ReactNode;
  if (error) {
    body = (
      <TableRow>
        <TableCell colSpan={columnCount} sx={{ borderBottom: 0 }}>
          <ErrorState title="Could not load data" description={error} onRetry={onRetry} compact />
        </TableCell>
      </TableRow>
    );
  } else if (loading && rows.length === 0) {
    body = Array.from({ length: skeletonRows }, (_, i) => (
      <TableRow key={`skeleton-${i}`}>
        {Array.from({ length: columnCount }, (_c, j) => (
          <TableCell key={j}>
            <Skeleton variant="text" />
          </TableCell>
        ))}
      </TableRow>
    ));
  } else if (rows.length === 0) {
    body = (
      <TableRow>
        <TableCell colSpan={columnCount} sx={{ borderBottom: 0 }}>
          {empty ?? (
            <EmptyState
              title="No results"
              description="Try adjusting the filters or the date range."
              compact
            />
          )}
        </TableCell>
      </TableRow>
    );
  } else {
    body = rows.map((row) => {
      const id = getRowId(row);
      const selected = selection?.selected.has(id) ?? false;
      return (
        <TableRow
          key={id}
          hover={Boolean(onRowClick)}
          selected={selected}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
          tabIndex={onRowClick ? 0 : undefined}
          sx={{ cursor: onRowClick ? 'pointer' : undefined, opacity: loading ? 0.6 : 1 }}
        >
          {selection && (
            <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selected}
                disabled={selection.isSelectable ? !selection.isSelectable(id) : false}
                onChange={() => toggle(id)}
                inputProps={{ 'aria-label': `Select row ${id}` }}
              />
            </TableCell>
          )}
          {columns.map((column) => (
            <TableCell
              key={column.key}
              align={column.align}
              sx={column.hideOnMobile ? mobileHidden : undefined}
            >
              {column.render(row)}
            </TableCell>
          ))}
        </TableRow>
      );
    });
  }

  return (
    <Box>
      <TableContainer sx={{ maxHeight, overflowX: 'auto' }}>
        <Table size={size} aria-label={label} aria-busy={loading} stickyHeader={Boolean(maxHeight)}>
          <TableHead>
            <TableRow>
              {selection && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={someSelected && !allSelected}
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={ids.length === 0}
                    inputProps={{ 'aria-label': 'Select all rows' }}
                  />
                </TableCell>
              )}
              {columns.map((column) => {
                const active = sort?.by === column.sortKey;
                const header =
                  column.sortKey && onSortChange ? (
                    <TableSortLabel
                      active={active}
                      direction={active ? sort?.dir : 'desc'}
                      onClick={() => onSort(column.sortKey as string)}
                    >
                      {column.header}
                      {active && (
                        <Box component="span" sx={visuallyHidden}>
                          {sort?.dir === 'asc' ? 'sorted ascending' : 'sorted descending'}
                        </Box>
                      )}
                    </TableSortLabel>
                  ) : (
                    column.header
                  );
                return (
                  <TableCell
                    key={column.key}
                    align={column.align}
                    sx={{
                      width: column.width,
                      minWidth: column.minWidth,
                      ...(column.hideOnMobile ? mobileHidden : {}),
                    }}
                    sortDirection={active ? sort?.dir : false}
                  >
                    {column.headerTooltip ? (
                      <Tooltip title={column.headerTooltip}>
                        <span>{header}</span>
                      </Tooltip>
                    ) : (
                      header
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>{body}</TableBody>
        </Table>
      </TableContainer>
      {pagination && pagination.total > 0 && (
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page - 1}
          rowsPerPage={pagination.pageSize}
          rowsPerPageOptions={
            pagination.onPageSizeChange
              ? (pagination.pageSizeOptions ?? [10, 25, 50, 100])
              : [pagination.pageSize]
          }
          onPageChange={(_e, page) => pagination.onPageChange(page + 1)}
          onRowsPerPageChange={(e) => pagination.onPageSizeChange?.(Number(e.target.value))}
        />
      )}
    </Box>
  );
}
