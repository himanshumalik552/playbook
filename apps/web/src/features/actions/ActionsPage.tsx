import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  ACTION_WORKFLOW,
  type ActionListItemDto,
  type ActionStatus,
} from '@adpulse/types';
import { type DataColumn, DataTable, PageHeader, SectionCard, StatusChip } from '@adpulse/ui';
import AddOutlined from '@mui/icons-material/AddOutlined';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined';
import ViewKanbanOutlined from '@mui/icons-material/ViewKanbanOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { type DragEvent, useState } from 'react';
import { errorMessage, toParams } from '@/api/client';
import { QueryError } from '@/components/QueryState';
import { Can, RequirePermission } from '@/components/RequirePermission';
import { useMembers } from '@/hooks/common';
import { useTableParams } from '@/hooks/useMetricFilters';
import { formatDate, formatRelative, humanize } from '@/lib/format';
import { ACTION_STATUS_LABELS, ACTION_STATUS_TONE, PRIORITY_TONE, RESULT_TONE } from '@/lib/status';
import { useOrg } from '@/providers/OrgProvider';
import { ActionDetailDrawer } from './ActionDetailDrawer';
import { ActionFormDialog } from './ActionFormDialog';
import { type ActionBoard, useActionBoard, useActionList, useTransitionAction } from './api';
import { NEEDS_DETAILS, type PendingTransition, TransitionDialog } from './TransitionDialog';

function BoardCard({
  action,
  onOpen,
  onMove,
  canMove,
}: {
  action: ActionListItemDto;
  onOpen: () => void;
  onMove: (to: ActionStatus) => void;
  canMove: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const targets = ACTION_WORKFLOW[action.status];
  return (
    <Card
      draggable={canMove && targets.length > 0}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData('text/action-id', action.id);
        e.dataTransfer.setData(`text/from-${action.status.toLowerCase()}`, '');
      }}
      sx={{ position: 'relative' }}
    >
      <CardActionArea onClick={onOpen} sx={{ p: 1.5, pr: 5 }}>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
          {action.title}
        </Typography>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
          <StatusChip tone={PRIORITY_TONE[action.priority]} label={humanize(action.priority)} />
          {action.resultClassification && (
            <StatusChip
              tone={RESULT_TONE[action.resultClassification]}
              label={humanize(action.resultClassification)}
            />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div">
          {action.owner?.name ?? 'Unassigned'}
          {action.campaignName ? ` · ${action.campaignName}` : ''}
        </Typography>
        {action.plannedDate && (
          <Typography variant="caption" color="text.secondary" component="div">
            Planned {formatDate(action.plannedDate)}
          </Typography>
        )}
      </CardActionArea>
      {canMove && targets.length > 0 && (
        <>
          <IconButton
            size="small"
            onClick={(e) => setAnchor(e.currentTarget)}
            aria-label={`Move ${action.title}`}
            sx={{ position: 'absolute', top: 6, right: 6 }}
          >
            <MoreVertRounded fontSize="small" />
          </IconButton>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            {targets.map((t) => (
              <MenuItem
                key={t}
                onClick={() => {
                  setAnchor(null);
                  onMove(t);
                }}
              >
                Move to {ACTION_STATUS_LABELS[t]}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Card>
  );
}

function Board({
  board,
  onOpen,
  onMove,
  canMove,
}: {
  board: ActionBoard;
  onOpen: (id: string) => void;
  onMove: (a: ActionListItemDto, to: ActionStatus) => void;
  canMove: boolean;
}) {
  const theme = useTheme();
  const [over, setOver] = useState<ActionStatus | null>(null);
  const all = ACTION_STATUSES.flatMap((s) => board[s] ?? []);

  const accepts = (e: DragEvent, status: ActionStatus) =>
    e.dataTransfer.types.some(
      (t) =>
        t.startsWith('text/from-') &&
        ACTION_WORKFLOW[t.slice(10).toUpperCase() as ActionStatus]?.includes(status),
    );

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.5,
        gridAutoFlow: 'column',
        gridAutoColumns: { xs: '82%', sm: '46%', md: 'minmax(230px, 1fr)' },
        overflowX: 'auto',
        pb: 1,
      }}
    >
      {ACTION_STATUSES.map((status) => {
        const items = board[status] ?? [];
        return (
          <Box
            key={status}
            component="section"
            aria-label={`${ACTION_STATUS_LABELS[status]} (${items.length})`}
            onDragOver={(e: DragEvent) => {
              if (accepts(e, status)) {
                e.preventDefault();
                setOver(status);
              }
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e: DragEvent) => {
              setOver(null);
              const action = all.find((a) => a.id === e.dataTransfer.getData('text/action-id'));
              if (action) onMove(action, status);
            }}
            sx={{
              bgcolor:
                over === status
                  ? alpha(theme.palette.primary.main, 0.08)
                  : alpha(theme.palette.text.primary, 0.03),
              border: `1px dashed ${over === status ? theme.palette.primary.main : 'transparent'}`,
              borderRadius: 2,
              p: 1.25,
              minHeight: 320,
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 1.25, px: 0.5 }}
            >
              <StatusChip tone={ACTION_STATUS_TONE[status]} label={ACTION_STATUS_LABELS[status]} />
              <Typography variant="caption" color="text.secondary">
                {items.length}
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {items.map((a) => (
                <BoardCard
                  key={a.id}
                  action={a}
                  onOpen={() => onOpen(a.id)}
                  onMove={(to) => onMove(a, to)}
                  canMove={canMove}
                />
              ))}
              {items.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                  No actions
                </Typography>
              )}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

function ActionsContent() {
  const { can } = useOrg();
  const table = useTableParams({ sortBy: 'updatedAt', sortDir: 'desc' });
  const members = useMembers();
  const { enqueueSnackbar } = useSnackbar();
  const transition = useTransitionAction();
  const view = table.getParam('view') === 'list' ? 'list' : 'board';
  const openId = table.getParam('id');
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const status = table.getParam('status') ?? '';
  const priority = table.getParam('priority') ?? '';
  const ownerId = table.getParam('owner') ?? '';

  const board = useActionBoard(view === 'board');
  const list = useActionList(
    toParams({
      status,
      priority,
      ownerId,
      page: table.page,
      pageSize: table.pageSize,
      sortBy: table.sortBy,
      sortDir: table.sortDir,
    }),
    view === 'list',
  );

  const move = (action: ActionListItemDto, to: ActionStatus) => {
    if (!ACTION_WORKFLOW[action.status].includes(to)) return;
    if (NEEDS_DETAILS.has(to)) {
      setPending({ id: action.id, title: action.title, to });
      return;
    }
    transition.mutate(
      { id: action.id, body: { status: to } },
      {
        onSuccess: () => enqueueSnackbar(`Moved to ${ACTION_STATUS_LABELS[to]}`, { variant: 'success' }),
        onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
      },
    );
  };

  const columns: DataColumn<ActionListItemDto>[] = [
    {
      key: 'title',
      header: 'Action',
      minWidth: 240,
      render: (a) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {a.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {a.campaignName ?? 'No campaign'}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <StatusChip tone={ACTION_STATUS_TONE[a.status]} label={ACTION_STATUS_LABELS[a.status]} />
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortKey: 'priority',
      render: (a) => <StatusChip tone={PRIORITY_TONE[a.priority]} label={humanize(a.priority)} />,
    },
    { key: 'owner', header: 'Owner', hideOnMobile: true, render: (a) => a.owner?.name ?? 'Unassigned' },
    {
      key: 'plannedDate',
      header: 'Planned',
      sortKey: 'plannedDate',
      hideOnMobile: true,
      render: (a) => formatDate(a.plannedDate),
    },
    {
      key: 'result',
      header: 'Result',
      hideOnMobile: true,
      render: (a) =>
        a.resultClassification ? (
          <StatusChip tone={RESULT_TONE[a.resultClassification]} label={humanize(a.resultClassification)} />
        ) : (
          '—'
        ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortKey: 'updatedAt',
      hideOnMobile: true,
      render: (a) => formatRelative(a.updatedAt),
    },
  ];

  return (
    <>
      <PageHeader
        title="Optimization actions"
        description="Plan, carry out and evaluate changes. Actions are tracked here; you apply them yourself in Google Ads."
        actions={
          <>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_e, v: string | null) =>
                v && table.setParam('view', v === 'board' ? null : v, false)
              }
              aria-label="View"
            >
              <ToggleButton value="board" aria-label="Board view">
                <ViewKanbanOutlined fontSize="small" />
              </ToggleButton>
              <ToggleButton value="list" aria-label="List view">
                <TableRowsOutlined fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
            <Can permission="actions:create">
              <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
                New action
              </Button>
            </Can>
          </>
        }
      />
      {view === 'board' ? (
        board.isError ? (
          <QueryError error={board.error} onRetry={() => void board.refetch()} />
        ) : board.isPending ? (
          <Skeleton variant="rounded" height={360} />
        ) : (
          <Board
            board={board.data}
            onOpen={(id) => table.setParam('id', id, false)}
            onMove={move}
            canMove={can('actions:update')}
          />
        )
      ) : (
        <SectionCard flush>
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ p: 2 }}>
            <TextField
              select
              label="Status"
              value={status}
              onChange={(e) => table.setParam('status', e.target.value || null)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All statuses</MenuItem>
              {ACTION_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {ACTION_STATUS_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Priority"
              value={priority}
              onChange={(e) => table.setParam('priority', e.target.value || null)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">Any</MenuItem>
              {ACTION_PRIORITIES.map((p) => (
                <MenuItem key={p} value={p}>
                  {humanize(p)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Owner"
              value={ownerId}
              onChange={(e) => table.setParam('owner', e.target.value || null)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Anyone</MenuItem>
              <MenuItem value="me">Mine</MenuItem>
              {(members.data ?? []).map((m) => (
                <MenuItem key={m.userId} value={m.userId}>
                  {m.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <DataTable
            label="Optimization actions"
            rows={list.data?.items ?? []}
            columns={columns}
            getRowId={(a) => a.id}
            loading={list.isPending || list.isFetching}
            error={list.isError ? errorMessage(list.error) : null}
            onRetry={() => void list.refetch()}
            sort={{ by: table.sortBy, dir: table.sortDir }}
            onSortChange={table.setSort}
            onRowClick={(a) => table.setParam('id', a.id, false)}
            pagination={
              list.data
                ? {
                    page: table.page,
                    pageSize: table.pageSize,
                    total: list.data.meta.total,
                    onPageChange: table.setPage,
                    onPageSizeChange: table.setPageSize,
                  }
                : undefined
            }
          />
        </SectionCard>
      )}
      <ActionDetailDrawer actionId={openId} onClose={() => table.setParam('id', null, false)} />
      <ActionFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(a) => table.setParam('id', a.id, false)}
      />
      <TransitionDialog pending={pending} onClose={() => setPending(null)} />
    </>
  );
}

export function ActionsPage() {
  return (
    <RequirePermission permission="analytics:read">
      <ActionsContent />
    </RequirePermission>
  );
}
