import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import type { KpiKey, KpiValues, MetricChange } from '@adpulse/types';
import { KpiCard } from '@adpulse/ui';
import Box from '@mui/material/Box';
import { toKpiChange, useFormat } from '@/lib/format';

export const DASHBOARD_KPIS: KpiKey[] = [
  'cost',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'conversions',
  'conversionRate',
  'cpa',
  'conversionValue',
  'roas',
];

interface KpiGridProps {
  current: KpiValues | null;
  previous?: KpiValues | null;
  change?: Partial<Record<KpiKey, MetricChange>> | null;
  loading?: boolean;
  metrics?: KpiKey[];
}

export function KpiGrid({
  current,
  previous,
  change,
  loading = false,
  metrics = DASHBOARD_KPIS,
}: KpiGridProps) {
  const f = useFormat();
  return (
    <Box
      component="section"
      aria-label="Key performance indicators"
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' },
      }}
    >
      {metrics.map((key) => {
        const def = METRIC_DEFINITIONS[key];
        return (
          <KpiCard
            key={key}
            label={def.shortLabel === def.label ? def.label : def.shortLabel}
            value={current ? f.metric(key, current[key]) : '—'}
            description={def.description}
            formula={def.formula}
            change={toKpiChange(change?.[key])}
            previousValue={previous ? f.metric(key, previous[key]) : null}
            loading={loading}
          />
        );
      })}
    </Box>
  );
}
