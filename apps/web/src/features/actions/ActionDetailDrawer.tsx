import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import { ACTION_WORKFLOW, type ActionDetailDto, type ActionStatus, type KpiKey } from '@adpulse/types';
import { ConfirmDialog, StatusChip } from '@adpulse/ui';
import { commentSchema } from '@adpulse/validation';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LinkRounded from '@mui/icons-material/LinkRounded';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { type ReactNode, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { QueryState } from '@/components/QueryState';
import { useMembers } from '@/hooks/common';
import { formatDate, formatDateTime, humanize, useFormat } from '@/lib/format';
import { ACTION_STATUS_LABELS, ACTION_STATUS_TONE, PRIORITY_TONE, RESULT_TONE } from '@/lib/status';
import { useOrg } from '@/providers/OrgProvider';
import { ActionFormDialog } from './ActionFormDialog';
import { useAction, useCommentAction, useDeleteAction, useTransitionAction, useUpdateAction } from './api';
import { NEEDS_DETAILS, type PendingTransition, TransitionDialog } from './TransitionDialog';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" component="div">
        {children}
      </Typography>
    </Box>
  );
}

function metricValue(metric: string | null, value: number | null, f: ReturnType<typeof useFormat>) {
  if (value === null) return '—';
  return metric && metric in METRIC_DEFINITIONS ? f.metric(metric as KpiKey, value) : f.number(value, 2);
}

const HISTORY_FIELD_LABELS: Record<string, string> = {
  expectedImpact: 'expected impact',
  campaignId: 'campaign',
  adGroupId: 'ad group',
  metricToMonitor: 'metric to monitor',
  baselineValue: 'baseline',
  targetValue: 'target',
  ownerId: 'owner',
  plannedDate: 'planned date',
  evaluationDate: 'evaluation date',
};
/** Identifier and free-text changes are listed without values: IDs are meaningless to readers and long text does not fit a history line. */
const OPAQUE_HISTORY_FIELDS = new Set([
  'campaignId',
  'adGroupId',
  'ownerId',
  'description',
  'hypothesis',
  'expectedImpact',
]);

function historyValue(field: string, value: string | null) {
  if (value === null) return '—';
  return field === 'status' || field === 'priority' ? humanize(value) : value;
}

function ActionBody({ action, onDeleted }: { action: ActionDetailDto; onDeleted: () => void }) {
  const { can } = useOrg();
  const f = useFormat();
  const members = useMembers();
  const update = useUpdateAction(action.id);
  const transition = useTransitionAction();
  const comment = useCommentAction(action.id);
  const remove = useDeleteAction();
  const { enqueueSnackbar } = useSnackbar();
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const nextStatuses = ACTION_WORKFLOW[action.status];
  const canUpdate = can('actions:update');
  const metricLabel =
    action.metricToMonitor && action.metricToMonitor in METRIC_DEFINITIONS
      ? METRIC_DEFINITIONS[action.metricToMonitor as KpiKey].label
      : action.metricToMonitor;

  const move = (to: ActionStatus) => {
    if (NEEDS_DETAILS.has(to)) setPending({ id: action.id, title: action.title, to, metricLabel });
    else
      transition.mutate(
        { id: action.id, body: { status: to } },
        {
          onSuccess: () => enqueueSnackbar(`Moved to ${ACTION_STATUS_LABELS[to]}`, { variant: 'success' }),
          onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
        },
      );
  };

  const submitComment = () => {
    const parsed = commentSchema.safeParse({ body });
    if (!parsed.success) return;
    comment.mutate(parsed.data.body, {
      onSuccess: () => setBody(''),
      onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
    });
  };

  return (
    <Stack spacing={2.5}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <StatusChip tone={ACTION_STATUS_TONE[action.status]} label={ACTION_STATUS_LABELS[action.status]} />
          <StatusChip tone={PRIORITY_TONE[action.priority]} label={`${humanize(action.priority)} priority`} />
          {action.resultClassification && (
            <StatusChip
              tone={RESULT_TONE[action.resultClassification]}
              label={`Result: ${humanize(action.resultClassification)}`}
            />
          )}
        </Stack>
        <Typography variant="h2" component="p">
          {action.title}
        </Typography>
        {action.campaignId && (
          <Typography variant="body2">
            <Link component={RouterLink} to={`/campaigns/${action.campaignId}`}>
              {action.campaignName}
            </Link>
            {action.adGroupName ? ` · ${action.adGroupName}` : ''}
          </Typography>
        )}
      </Stack>

      {canUpdate && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {nextStatuses.map((s) => (
            <Button
              key={s}
              size="small"
              variant={s === 'CANCELLED' ? 'text' : 'outlined'}
              color={s === 'CANCELLED' ? 'error' : 'primary'}
              onClick={() => move(s)}
              disabled={transition.isPending}
            >
              {s === 'EVALUATED' ? 'Evaluate' : `Move to ${ACTION_STATUS_LABELS[s]}`}
            </Button>
          ))}
          <Button size="small" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          {can('actions:assign') && (
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutline />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
        </Stack>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
        <Field label="Owner">
          {can('actions:assign') ? (
            <TextField
              select
              size="small"
              value={action.owner?.id ?? ''}
              onChange={(e) =>
                update.mutate(
                  { ownerId: e.target.value || null },
                  { onError: (err) => enqueueSnackbar(errorMessage(err), { variant: 'error' }) },
                )
              }
              slotProps={{ htmlInput: { 'aria-label': 'Owner' } }}
              fullWidth
            >
              <MenuItem value="">Unassigned</MenuItem>
              {(members.data ?? []).map((m) => (
                <MenuItem key={m.userId} value={m.userId}>
                  {m.name}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            (action.owner?.name ?? 'Unassigned')
          )}
        </Field>
        <Field label="Planned / evaluate on">
          {formatDate(action.plannedDate)} / {formatDate(action.evaluationDate)}
        </Field>
        <Field label="Metric to monitor">{metricLabel ?? '—'}</Field>
        <Field label="Baseline → target">
          {metricValue(action.metricToMonitor, action.baselineValue, f)} →{' '}
          {metricValue(action.metricToMonitor, action.targetValue, f)}
        </Field>
        {action.actualValue !== null && (
          <Field label="Actual">{metricValue(action.metricToMonitor, action.actualValue, f)}</Field>
        )}
        {action.completedAt && (
          <Field label="Completed">{formatDateTime(action.completedAt, f.timeZone)}</Field>
        )}
      </Box>

      {action.description && <Field label="What will be done">{action.description}</Field>}
      {action.hypothesis && <Field label="Hypothesis">{action.hypothesis}</Field>}
      {action.expectedImpact && <Field label="Expected impact">{action.expectedImpact}</Field>}
      {action.actualResult && <Field label="Actual result">{action.actualResult}</Field>}
      {action.cancellationReason && <Field label="Cancellation reason">{action.cancellationReason}</Field>}
      {(action.alertId || action.recommendationId) && (
        <Field label="Origin">
          {action.alertId && (
            <Link component={RouterLink} to={`/alerts?id=${action.alertId}`}>
              Source alert
            </Link>
          )}
          {action.alertId && action.recommendationId && ' · '}
          {action.recommendationId && (
            <Link component={RouterLink} to="/recommendations?status=CONVERTED">
              Source recommendation
            </Link>
          )}
        </Field>
      )}
      {action.attachments.length > 0 && (
        <Field label="Attachments">
          <Stack spacing={0.5}>
            {action.attachments.map((a) => (
              <Link
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              >
                <LinkRounded fontSize="small" /> {a.name}
              </Link>
            ))}
          </Stack>
        </Field>
      )}

      <Divider />
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Comments ({action.comments.length})
        </Typography>
        <Stack spacing={1.5}>
          {action.comments.map((c) => (
            <Stack key={c.id} direction="row" spacing={1.5}>
              <Avatar sx={{ width: 28, height: 28, fontSize: 12 }}>{c.author.name.slice(0, 1)}</Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {c.author.name} · {formatDateTime(c.createdAt, f.timeZone)}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {c.body}
                </Typography>
              </Box>
            </Stack>
          ))}
          {canUpdate && (
            <Stack spacing={1}>
              <TextField
                label="Add a comment"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 5000 } }}
              />
              <Box>
                <Button
                  size="small"
                  variant="contained"
                  onClick={submitComment}
                  disabled={!body.trim() || comment.isPending}
                >
                  Post comment
                </Button>
              </Box>
            </Stack>
          )}
        </Stack>
      </Box>

      {action.history.length > 0 && (
        <>
          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              History
            </Typography>
            <Stack spacing={0.75}>
              {action.history.map((h) => (
                <Typography key={h.id} variant="caption" color="text.secondary">
                  {formatDateTime(h.createdAt, f.timeZone)} · {h.changedBy ?? humanize(h.source)} changed{' '}
                  {HISTORY_FIELD_LABELS[h.field] ?? h.field}
                  {!OPAQUE_HISTORY_FIELDS.has(h.field) && (h.oldValue !== null || h.newValue !== null)
                    ? `: ${historyValue(h.field, h.oldValue)} → ${historyValue(h.field, h.newValue)}`
                    : ''}
                </Typography>
              ))}
            </Stack>
          </Box>
        </>
      )}

      <ActionFormDialog open={editing} action={action} onClose={() => setEditing(false)} />
      <TransitionDialog pending={pending} onClose={() => setPending(null)} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete action?"
        description="The action is removed from the board. Its history is retained for audit."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(action.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              enqueueSnackbar('Action deleted', { variant: 'info' });
              onDeleted();
            },
            onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
          })
        }
      />
    </Stack>
  );
}

export function ActionDetailDrawer({ actionId, onClose }: { actionId: string | null; onClose: () => void }) {
  const query = useAction(actionId);
  return (
    <Drawer
      anchor="right"
      open={Boolean(actionId)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 } } } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Typography variant="h3" component="h2">
          Action detail
        </Typography>
        <IconButton onClick={onClose} aria-label="Close action detail">
          <CloseRounded />
        </IconButton>
      </Stack>
      <Divider />
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        <QueryState query={query}>
          {(action) => <ActionBody action={action} onDeleted={onClose} />}
        </QueryState>
      </Box>
    </Drawer>
  );
}
