import { formatChangePercent, formatMetric, KPI_KEYS, METRIC_DEFINITIONS } from '@adpulse/kpi';
import type { KpiKey } from '@adpulse/types';
import { escapeHtml } from '../email/templates';
import { lineChartSvg } from './charts';
import type { ReportCampaignRow, ReportData } from './report-data';

const e = (v: string | number | null | undefined) =>
  escapeHtml(v === null || v === undefined ? '—' : String(v));

function metric(key: KpiKey, value: number | null, currency: string) {
  return e(formatMetric(key, value, { currency }));
}

function changeCell(data: ReportData, key: KpiKey) {
  const change = data.kpis.change?.[key];
  if (!change || change.percent === null) return '<td class="num muted">—</td>';
  const cls = change.isImprovement === null ? 'muted' : change.isImprovement ? 'good' : 'bad';
  return `<td class="num ${cls}">${e(formatChangePercent(change.percent))}</td>`;
}

function campaignTable(rows: ReportCampaignRow[], currency: string, withNote: boolean) {
  if (rows.length === 0) return '<p class="muted">No campaigns in this category for the selected period.</p>';
  const head = `<tr><th>Campaign</th><th>Account</th><th class="num">Spend</th><th class="num">Conv.</th><th class="num">CPA</th><th class="num">ROAS</th><th class="num">CTR</th>${withNote ? '<th>Observation</th>' : ''}</tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr><td>${e(r.name)}</td><td>${e(r.accountName)}</td><td class="num">${metric('cost', r.current.cost, currency)}</td><td class="num">${metric('conversions', r.current.conversions, currency)}</td><td class="num">${metric('cpa', r.current.cpa, currency)}</td><td class="num">${metric('roas', r.current.roas, currency)}</td><td class="num">${metric('ctr', r.current.ctr, currency)}</td>${withNote ? `<td>${e(r.note)}</td>` : ''}</tr>`,
    )
    .join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function list(items: string[], empty: string) {
  return items.length === 0
    ? `<p class="muted">${e(empty)}</p>`
    : `<ul>${items.map((i) => `<li>${e(i)}</li>`).join('')}</ul>`;
}

function kpiCards(data: ReportData) {
  const keys: KpiKey[] = ['cost', 'conversions', 'cpa', 'roas', 'conversionValue', 'ctr'];
  return keys
    .map((k) => {
      const change = data.kpis.change?.[k];
      const cls = !change || change.isImprovement === null ? 'muted' : change.isImprovement ? 'good' : 'bad';
      return `<div class="card"><div class="label">${e(METRIC_DEFINITIONS[k].label)}</div><div class="value">${metric(k, data.kpis.current[k], data.currencyCode)}</div><div class="delta ${cls}">${e(formatChangePercent(change?.percent ?? null))} vs prior</div></div>`;
    })
    .join('');
}

function executiveSummary(data: ReportData): string {
  const c = data.kpis.current;
  const ch = data.kpis.change;
  const money = (v: number | null) => formatMetric('cost', v, { currency: data.currencyCode });
  const parts = [
    `Spend was ${money(c.cost)} (${formatChangePercent(ch?.cost?.percent ?? null)} vs the prior period), generating ${formatMetric('conversions', c.conversions)} conversions worth ${money(c.conversionValue)}.`,
    `Blended CPA was ${money(c.cpa)} and ROAS ${formatMetric('roas', c.roas)}.`,
  ];
  const missed = data.targets.filter((t) => t.met === false).map((t) => t.label);
  parts.push(missed.length ? `Targets missed: ${missed.join(', ')}.` : 'All tracked targets were met.');
  if (data.underperformingCampaigns.length)
    parts.push(`${data.underperformingCampaigns.length} campaign(s) need attention.`);
  return parts.join(' ');
}

export function renderReportHtml(data: ReportData): string {
  const color = /^#[0-9a-fA-F]{6}$/.test(data.branding.primaryColor) ? data.branding.primaryColor : '#3949AB';
  const cur = data.currencyCode;
  const trendSvg = lineChartSvg(
    data.trend.map((d) => d.date),
    [
      { label: 'Spend', color, values: data.trend.map((d) => d.cost) },
      { label: 'Conversion value', color: '#2e7d32', values: data.trend.map((d) => d.conversionValue) },
    ],
  );
  const convSvg = lineChartSvg(
    data.trend.map((d) => d.date),
    [{ label: 'Conversions', color: '#ef6c00', values: data.trend.map((d) => d.conversions) }],
    { height: 160 },
  );
  const kpiRows = KPI_KEYS.map(
    (k) =>
      `<tr><td>${e(METRIC_DEFINITIONS[k].label)}</td><td class="num">${metric(k, data.kpis.current[k], cur)}</td><td class="num">${metric(k, data.kpis.previous?.[k] ?? null, cur)}</td>${changeCell(data, k)}</tr>`,
  ).join('');
  const targetRows = data.targets
    .map((t) => {
      const key: KpiKey =
        t.metric === 'CPA'
          ? 'cpa'
          : t.metric === 'ROAS'
            ? 'roas'
            : t.metric === 'CTR'
              ? 'ctr'
              : 'conversionRate';
      const status =
        t.met === null
          ? '<span class="pill muted">No data</span>'
          : t.met
            ? '<span class="pill ok">On target</span>'
            : '<span class="pill warn">Off target</span>';
      return `<tr><td>${e(t.label)}</td><td class="num">${metric(key, t.target, cur)}</td><td class="num">${metric(key, t.actual, cur)}</td><td>${status}</td></tr>`;
    })
    .join('');
  const alertRows = data.alerts
    .map(
      (a) =>
        `<tr><td><span class="pill ${a.severity === 'CRITICAL' ? 'bad-bg' : a.severity === 'WARNING' ? 'warn' : 'muted'}">${e(a.severity)}</span></td><td>${e(a.entity)}</td><td>${e(a.explanation)}</td><td>${e(a.status)}</td></tr>`,
    )
    .join('');
  const actionRows = data.completedActions
    .map(
      (a) =>
        `<tr><td>${e(a.title)}</td><td>${e(a.owner)}</td><td>${e(a.completedAt?.slice(0, 10))}</td><td>${e(a.classification)}</td><td>${e(a.result)}</td></tr>`,
    )
    .join('');
  const filters = [
    `Account: ${data.filters.adAccount ?? 'All accounts'}`,
    `Campaigns: ${data.filters.campaigns.length ? data.filters.campaigns.join(', ') : 'All campaigns'}`,
    `Comparison: ${data.previousPeriod.from} – ${data.previousPeriod.to}`,
  ];
  const commentary = data.commentary.trim()
    ? data.commentary
        .split(/\n{2,}/)
        .map((p) => `<p>${e(p).replace(/\n/g, '<br/>')}</p>`)
        .join('')
    : '<p class="muted">No executive commentary was provided.</p>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${e(data.title)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #1a2233; font-size: 11px; margin: 0; }
  header { border-bottom: 3px solid ${color}; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 22px; margin: 0; color: ${color}; }
  h2 { font-size: 14px; margin: 22px 0 8px; color: ${color}; break-after: avoid; }
  .sub { color: #5f6b7a; margin-top: 4px; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .card { border: 1px solid #e3e7ef; border-radius: 8px; padding: 10px; break-inside: avoid; }
  .card .label { color: #5f6b7a; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .card .value { font-size: 18px; font-weight: 600; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { background: #f4f6fb; text-align: left; font-weight: 600; padding: 6px; border-bottom: 1px solid #d5dbe7; }
  td { padding: 5px 6px; border-bottom: 1px solid #eef1f6; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .good { color: #2e7d32; } .bad { color: #c62828; } .muted { color: #5f6b7a; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #eef1f6; }
  .pill.ok { background: #e8f5e9; color: #2e7d32; } .pill.warn { background: #fff4e0; color: #9a5b00; } .pill.bad-bg { background: #fdecea; color: #c62828; }
  .section { break-inside: avoid-page; }
  .summary { background: #f4f6fb; border-left: 4px solid ${color}; padding: 10px 12px; border-radius: 4px; line-height: 1.5; }
  footer { margin-top: 24px; color: #5f6b7a; font-size: 10px; border-top: 1px solid #e3e7ef; padding-top: 8px; }
  ul { margin: 4px 0; padding-left: 18px; } li { margin-bottom: 3px; }
</style></head>
<body>
<header>
  <h1>${e(data.title)}</h1>
  <div class="sub">${e(data.organizationName)} · ${e(data.period.from)} – ${e(data.period.to)} · ${e(data.frequency.toLowerCase())} report · ${e(data.currencyCode)} · ${e(data.timezone)}</div>
</header>

<section class="section"><h2>Executive summary</h2><div class="summary">${e(executiveSummary(data))}</div>${commentary}</section>
<section class="section"><h2>Key metrics</h2><div class="cards">${kpiCards(data)}</div></section>
<section class="section"><h2>Current vs prior period</h2>
<table><thead><tr><th>Metric</th><th class="num">Current</th><th class="num">Prior</th><th class="num">Change</th></tr></thead><tbody>${kpiRows}</tbody></table></section>
<section class="section"><h2>Target status</h2>
<table><thead><tr><th>Target</th><th class="num">Target</th><th class="num">Actual</th><th>Status</th></tr></thead><tbody>${targetRows}</tbody></table></section>
<section class="section"><h2>Trends</h2>${trendSvg}${convSvg}</section>
<section><h2>Top-performing campaigns</h2>${campaignTable(data.topCampaigns, cur, false)}</section>
<section><h2>Underperforming campaigns</h2>${campaignTable(data.underperformingCampaigns, cur, true)}</section>
<section><h2>Key alerts</h2>${alertRows ? `<table><thead><tr><th>Severity</th><th>Entity</th><th>Detail</th><th>Status</th></tr></thead><tbody>${alertRows}</tbody></table>` : '<p class="muted">No alerts for this period.</p>'}</section>
<section><h2>Completed actions</h2>${actionRows ? `<table><thead><tr><th>Action</th><th>Owner</th><th>Completed</th><th>Result</th><th>Notes</th></tr></thead><tbody>${actionRows}</tbody></table>` : '<p class="muted">No actions were completed in this period.</p>'}</section>
<section class="section"><h2>Risks and blockers</h2>${list(data.risks, 'No material risks identified.')}</section>
<section class="section"><h2>Recommended next actions</h2>${list(data.nextActions, 'No open recommendations.')}</section>
<section class="section"><h2>Applied filters</h2>${list(filters, '')}</section>
<footer>
  <div><strong>Data freshness:</strong> ${e(data.dataFreshness.note)} Last successful sync: ${e(data.dataFreshness.lastSyncAt ?? 'never')}.</div>
  <div>Generated ${e(data.generatedAt)} by ADPULSE. Recommendations are evidence-based suggestions derived from correlations and require human review.${data.branding.reportFooter ? ` ${e(data.branding.reportFooter)}` : ''}</div>
</footer>
</body></html>`;
}
