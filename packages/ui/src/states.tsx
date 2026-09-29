import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InboxRounded from '@mui/icons-material/InboxRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface StateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}

function StateLayout({ title, description, action, icon, compact, role }: StateProps & { role?: string }) {
  return (
    <Box role={role} sx={{ py: compact ? 3 : 6, px: 2, textAlign: 'center' }}>
      <Stack spacing={1.25} alignItems="center" sx={{ maxWidth: 480, mx: 'auto' }}>
        <Box sx={{ color: 'text.secondary', '& svg': { fontSize: compact ? 32 : 44 } }} aria-hidden>
          {icon}
        </Box>
        <Typography variant="h3" component="p">
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" component="div">
            {description}
          </Typography>
        )}
        {action && <Box sx={{ pt: 0.5 }}>{action}</Box>}
      </Stack>
    </Box>
  );
}

/** Guidance for a list or chart with no data, ideally with the next step as action. */
export function EmptyState(props: StateProps) {
  return <StateLayout icon={<InboxRounded />} {...props} />;
}

export function ErrorState({ onRetry, ...props }: StateProps & { onRetry?: () => void }) {
  return (
    <StateLayout
      role="alert"
      icon={<ErrorOutlineRounded />}
      action={
        props.action ??
        (onRetry ? (
          <Button variant="outlined" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined)
      }
      {...props}
    />
  );
}

export function ForbiddenState(props: Partial<StateProps>) {
  return (
    <StateLayout
      icon={<LockOutlined />}
      title={props.title ?? 'You do not have access to this'}
      description={props.description ?? 'Ask an organization administrator if you need this permission.'}
      {...props}
    />
  );
}
