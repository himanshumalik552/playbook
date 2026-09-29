import type { ReportCampaignRow, ReportData } from '@adpulse/types';
import { type DataColumn, DataTable, SectionCard, StatusChip } from '@adpulse/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { SpendValueChart } from '@/components/charts/charts';
import { metricColumn } from '@/features/campaigns/columns';
import { KpiGrid } from '@/features/dashboard/KpiGrid';
import { formatDate, humanize, useFormat } from '@/lib/format';

function CampaignList({ title, rows }: { title: string; rows: ReportCampaignRow[] }) {
  const columns: DataColumn<ReportCampaignRow>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={600}>
            {r.name}
          </Typography>
          {r.note && (
            <Typography variant="caption" color="text.secondary">
              {r.note}
            </Typography>
          )}
        </Stack>
      ),
    },
    ...(['cost', 'conversions', 'cpa', 'roas'] as const).map((key) => ({
      ...metricColumn<ReportCampaignRow>(key, (r) => ({ current: r.current }), key === 'roas'),
      sortKey: undefined,
    })),
  ];
  return (
    <SectionCard title={title} flush>
      <DataTable
        label={title}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        empty={
          <Typography sx={{ p: 2 }} color="text.secondary">
            No campaigns in this group.
          </Typography>
        }
      />
    </SectionCard>
  );
}

export function ReportPreview({ data }: { data: ReportData }) {
  const f = useFormat();
  return (
    <Stack spacing={2.5} component="article" aria-label="Report preview">
      <Box sx={{ borderLeft: 4, borderColor: data.branding.primaryColor, pl: 2 }}>
        <Typography variant="overline" color="text.secondary">
          {data.organizationName} · {humanize(data.frequency)} report
        </Typography>
        <Typography variant="h2">{data.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {formatDate(data.period.from)} – {formatDate(data.period.to)} compared with{' '}
          {formatDate(data.previousPeriod.from)} – {formatDate(data.previousPeriod.to)}
          {data.filters.adAccount ? ` · ${data.filters.adAccount}` : ''}
          {data.filters.campaigns.length > 0 ? ` · ${data.filters.campaigns.length} campaign(s)` : ''}
        </Typography>
      </Box>

      {data.commentary && (
        <SectionCard title="Executive commentary">
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {data.commentary}
          </Typography>
        </SectionCard>
      )}

      <KpiGrid current={data.kpis.current} previous={data.kpis.previous} change={data.kpis.change} />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' } }}>
        <SectionCard title="Spend versus conversion value">
          <SpendValueChart data={data.trend} />
        </SectionCard>
        <SectionCard title="Performance against targets">
          {data.targets.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No targets configured. Set targets to include this section.
            </Typography>
          ) : (
            <Stack spacing={1.25}>
              {data.targets.map((t) => (
                <Stack
                  key={t.metric}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1}
                >
                  <Typography variant="body2">{t.label}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" fontWeight={600}>
                      {t.actual === null ? '—' : f.number(t.actual, 2)} / {f.number(t.target, 2)}
                    </Typography>
                    {t.met !== null && (
                      <StatusChip tone={t.met ? 'success' : 'error'} label={t.met ? 'Met' : 'Missed'} />
                    )}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        <CampaignList title="Top campaigns" rows={data.topCampaigns} />
        <CampaignList title="Underperforming campaigns" rows={data.underperformingCampaigns} />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        <SectionCard title={`Alerts raised (${data.alerts.length})`}>
          {data.alerts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No alerts were raised in this period.
            </Typography>
          ) : (
            <Stack spacing={1} component="ul" sx={{ m: 0, pl: 2 }}>
              {data.alerts.slice(0, 8).map((a, i) => (
                <Typography key={i} component="li" variant="body2">
                  <strong>{humanize(a.severity)}</strong> · {a.entity ?? 'Organization'} — {a.explanation}
                </Typography>
              ))}
            </Stack>
          )}
        </SectionCard>
        <SectionCard title="Risks and next actions">
          <Stack spacing={1}>
            {[
              ...data.risks.map((r) => ({ kind: 'Risk', text: r })),
              ...data.nextActions.map((n) => ({ kind: 'Next', text: n })),
            ].map((item, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                <StatusChip tone={item.kind === 'Risk' ? 'warning' : 'info'} label={item.kind} />
                <Typography variant="body2">{item.text}</Typography>
              </Stack>
            ))}
            {data.risks.length + data.nextActions.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Nothing flagged for this period.
              </Typography>
            )}
          </Stack>
        </SectionCard>
      </Box>

      <Alert severity="info" variant="outlined">
        {data.dataFreshness.note} Last metric date: {formatDate(data.dataFreshness.lastMetricDate)}.
      </Alert>
    </Stack>
  );
}
