import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { visuallyHidden } from './a11y';

export interface KpiChange {
  /** Pre-formatted percentage, e.g. "+12.4%". */
  label: string;
  direction: 'up' | 'down' | 'flat';
  /** null when the metric carries no judgement (e.g. spend) or when there is no comparison. */
  isImprovement: boolean | null;
}

export interface KpiCardProps {
  label: string;
  value: string;
  description?: string;
  formula?: string | null;
  change?: KpiChange | null;
  previousValue?: string | null;
  loading?: boolean;
  footer?: ReactNode;
}

function changeColor(change: KpiChange): string {
  if (change.isImprovement === null || change.direction === 'flat') return 'text.secondary';
  return change.isImprovement ? 'success.main' : 'error.main';
}

export function KpiCard({
  label,
  value,
  description,
  formula,
  change,
  previousValue,
  loading = false,
  footer,
}: KpiCardProps) {
  const tooltip = [description, formula ? `Formula: ${formula}` : null].filter(Boolean).join(' ');
  return (
    <Card sx={{ height: '100%' }} aria-busy={loading}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
          <Typography variant="overline" color="text.secondary" component="h3" sx={{ lineHeight: 1.6 }}>
            {label}
          </Typography>
          {tooltip && (
            <Tooltip title={tooltip}>
              <Box
                component="span"
                role="img"
                aria-label={`About ${label}`}
                tabIndex={0}
                sx={{ display: 'inline-flex', borderRadius: '50%' }}
              >
                <InfoOutlined sx={{ fontSize: 15, color: 'text.secondary' }} />
              </Box>
            </Tooltip>
          )}
        </Stack>
        {loading ? (
          <>
            <Skeleton variant="text" width="70%" height={36} />
            <Skeleton variant="text" width="45%" />
          </>
        ) : (
          <>
            <Typography variant="h2" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </Typography>
            <Box sx={{ minHeight: 22, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              {change ? (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.25}
                  sx={{ color: changeColor(change) }}
                  data-testid="kpi-change"
                >
                  {change.direction === 'up' && <ArrowUpwardRounded sx={{ fontSize: 16 }} aria-hidden />}
                  {change.direction === 'down' && <ArrowDownwardRounded sx={{ fontSize: 16 }} aria-hidden />}
                  <Typography variant="body2" fontWeight={600} component="span">
                    {change.label}
                  </Typography>
                  {change.isImprovement !== null && change.direction !== 'flat' && (
                    <Typography component="span" sx={visuallyHidden}>
                      {change.isImprovement ? '(improvement)' : '(decline)'}
                    </Typography>
                  )}
                </Stack>
              ) : null}
              {previousValue && (
                <Typography variant="caption" color="text.secondary">
                  vs {previousValue}
                </Typography>
              )}
            </Box>
            {footer}
          </>
        )}
      </CardContent>
    </Card>
  );
}
