import { compareKpis } from '@adpulse/kpi';
import type { KpiKey, KpiValues } from '@adpulse/types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { toKpiChange, useFormat } from '@/lib/format';

interface MetricCellProps {
  metric: KpiKey;
  current: KpiValues;
  previous?: KpiValues | null;
}

/** Table cell with the current value and, when comparing, the change vs. the previous period. */
export function MetricCell({ metric, current, previous }: MetricCellProps) {
  const f = useFormat();
  const change = previous ? toKpiChange(compareKpis(current, previous)[metric]) : null;
  const color =
    !change || change.isImprovement === null || change.direction === 'flat'
      ? 'text.secondary'
      : change.isImprovement
        ? 'success.main'
        : 'error.main';
  return (
    <Box sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      <Typography variant="body2" component="span">
        {f.metric(metric, current[metric])}
      </Typography>
      {change && (
        <Typography variant="caption" component="div" sx={{ color }}>
          {change.label}
        </Typography>
      )}
    </Box>
  );
}
