import { METRIC_DEFINITIONS } from '@adpulse/kpi';
import { type CampaignRowDto, type KpiKey, OBJECTIVE_LABELS } from '@adpulse/types';
import { type DataColumn, StatusChip } from '@adpulse/ui';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { MetricCell } from '@/components/MetricCell';
import { humanize } from '@/lib/format';
import { CAMPAIGN_STATUS_TONE } from '@/lib/status';

export function metricColumn<T>(
  key: KpiKey,
  get: (row: T) => { current: CampaignRowDto['current']; previous?: CampaignRowDto['previous'] },
  hideOnMobile = false,
): DataColumn<T> {
  const def = METRIC_DEFINITIONS[key];
  return {
    key,
    header: def.shortLabel,
    headerTooltip: [def.label, def.formula].filter(Boolean).join(' = '),
    align: 'right',
    sortKey: key,
    hideOnMobile,
    render: (row) => {
      const values = get(row);
      return <MetricCell metric={key} current={values.current} previous={values.previous} />;
    },
  };
}

export function campaignColumns(search = ''): DataColumn<CampaignRowDto>[] {
  const get = (r: CampaignRowDto) => ({ current: r.current, previous: r.previous });
  return [
    {
      key: 'name',
      header: 'Campaign',
      sortKey: 'name',
      minWidth: 220,
      render: (r) => (
        <Stack spacing={0.25}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Link
              component={RouterLink}
              to={`/campaigns/${r.id}${search}`}
              fontWeight={600}
              underline="hover"
              onClick={(e) => e.stopPropagation()}
            >
              {r.name}
            </Link>
            {r.openAlerts > 0 && (
              <Tooltip title={`${r.openAlerts} open alert(s)`}>
                <NotificationsActiveOutlined
                  color="warning"
                  sx={{ fontSize: 16 }}
                  titleAccess={`${r.openAlerts} open alerts`}
                />
              </Tooltip>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {r.adAccountName} · {OBJECTIVE_LABELS[r.objective]}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (r) => <StatusChip tone={CAMPAIGN_STATUS_TONE[r.status]} label={humanize(r.status)} />,
      hideOnMobile: true,
    },
    metricColumn('cost', get),
    metricColumn('impressions', get, true),
    metricColumn('clicks', get, true),
    metricColumn('ctr', get, true),
    metricColumn('cpc', get, true),
    metricColumn('conversions', get),
    metricColumn('conversionRate', get, true),
    metricColumn('cpa', get),
    metricColumn('conversionValue', get, true),
    metricColumn('roas', get),
  ];
}
