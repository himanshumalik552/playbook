import { formatMetric, KPI_KEYS, METRIC_DEFINITIONS } from '@adpulse/kpi';
import ExcelJS from 'exceljs';
import type { ReportData } from './report-data';

interface ColumnSpec {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
}

const CURRENCY_FMT = '#,##0.00';
const INT_FMT = '#,##0';
const DEC_FMT = '#,##0.00';
const PCT_FMT = '0.00"%"';
const RATIO_FMT = '0.00"x"';

const metricColumns = (): ColumnSpec[] => [
  { header: 'Impressions', key: 'impressions', width: 14, numFmt: INT_FMT },
  { header: 'Clicks', key: 'clicks', width: 10, numFmt: INT_FMT },
  { header: 'Spend', key: 'cost', width: 14, numFmt: CURRENCY_FMT },
  { header: 'Conversions', key: 'conversions', width: 13, numFmt: DEC_FMT },
  { header: 'Conv. value', key: 'conversionValue', width: 14, numFmt: CURRENCY_FMT },
  { header: 'CTR', key: 'ctr', width: 9, numFmt: PCT_FMT },
  { header: 'CPC', key: 'cpc', width: 10, numFmt: CURRENCY_FMT },
  { header: 'Conv. rate', key: 'conversionRate', width: 11, numFmt: PCT_FMT },
  { header: 'CPA', key: 'cpa', width: 11, numFmt: CURRENCY_FMT },
  { header: 'ROAS', key: 'roas', width: 9, numFmt: RATIO_FMT },
];

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ColumnSpec[],
  rows: Record<string, string | number | null>[],
  color: string,
) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.numFmt ? { numFmt: c.numFmt } : {},
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.replace('#', '')}` } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  rows.forEach((r) => sheet.addRow(r));
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: columns.length },
  };
  return sheet;
}

export async function renderReportExcel(data: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ADPULSE';
  workbook.created = new Date(data.generatedAt);
  workbook.title = data.title;
  const color = /^#[0-9a-fA-F]{6}$/.test(data.branding.primaryColor) ? data.branding.primaryColor : '#3949AB';

  const summary = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 6 }] });
  summary.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 18 },
    { key: 'c', width: 18 },
    { key: 'd', width: 14 },
  ];
  summary.addRow([data.title]).font = {
    bold: true,
    size: 16,
    color: { argb: `FF${color.replace('#', '')}` },
  };
  summary.addRow([
    `${data.organizationName} · ${data.period.from} – ${data.period.to} (${data.currencyCode}, ${data.timezone})`,
  ]);
  summary.addRow([`Compared with ${data.previousPeriod.from} – ${data.previousPeriod.to}`]);
  summary.addRow([
    `Filters: ${data.filters.adAccount ?? 'All accounts'}; ${data.filters.campaigns.length ? data.filters.campaigns.join(', ') : 'all campaigns'}`,
  ]);
  summary.addRow([]);
  const head = summary.addRow(['Metric', 'Current', 'Prior', 'Change %']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.replace('#', '')}` } };
  for (const key of KPI_KEYS) {
    const def = METRIC_DEFINITIONS[key];
    const row = summary.addRow([
      def.label,
      data.kpis.current[key],
      data.kpis.previous?.[key] ?? null,
      data.kpis.change?.[key]?.percent ?? null,
    ]);
    const fmt =
      def.format === 'currency'
        ? CURRENCY_FMT
        : def.format === 'percent'
          ? PCT_FMT
          : def.format === 'ratio'
            ? RATIO_FMT
            : def.format === 'integer'
              ? INT_FMT
              : DEC_FMT;
    row.getCell(2).numFmt = fmt;
    row.getCell(3).numFmt = fmt;
    row.getCell(4).numFmt = '0.0"%"';
  }
  summary.addRow([]);
  summary.addRow(['Target status']).font = { bold: true };
  for (const t of data.targets) {
    const key =
      t.metric === 'CPA'
        ? 'cpa'
        : t.metric === 'ROAS'
          ? 'roas'
          : t.metric === 'CTR'
            ? 'ctr'
            : 'conversionRate';
    summary.addRow([
      t.label,
      formatMetric(key, t.target, { currency: data.currencyCode }),
      formatMetric(key, t.actual, { currency: data.currencyCode }),
      t.met === null ? 'No data' : t.met ? 'On target' : 'Off target',
    ]);
  }
  summary.addRow([]);
  summary.addRow(['Executive commentary']).font = { bold: true };
  summary.addRow([data.commentary || 'No commentary provided.']).alignment = { wrapText: true };
  summary.addRow([]);
  summary.addRow(['Risks and blockers']).font = { bold: true };
  (data.risks.length ? data.risks : ['None identified']).forEach((r) => summary.addRow([r]));
  summary.addRow([]);
  summary.addRow(['Recommended next actions']).font = { bold: true };
  (data.nextActions.length ? data.nextActions : ['None']).forEach((r) => summary.addRow([r]));
  summary.addRow([]);
  summary.addRow([`Data freshness: ${data.dataFreshness.note}`]);
  summary.addRow([`Generated: ${data.generatedAt}`]);

  addSheet(
    workbook,
    'Campaigns',
    [
      { header: 'Campaign', key: 'name', width: 36 },
      { header: 'Account', key: 'account', width: 30 },
      { header: 'Objective', key: 'objective', width: 16 },
      { header: 'Status', key: 'status', width: 10 },
      ...metricColumns(),
      { header: 'Prior spend', key: 'prevCost', width: 14, numFmt: CURRENCY_FMT },
      { header: 'Prior CPA', key: 'prevCpa', width: 11, numFmt: CURRENCY_FMT },
      { header: 'Prior ROAS', key: 'prevRoas', width: 11, numFmt: RATIO_FMT },
      { header: 'Observation', key: 'note', width: 30 },
    ],
    data.campaigns.map((c) => ({
      name: c.name,
      account: c.accountName,
      objective: c.objective,
      status: c.status,
      ...c.current,
      prevCost: c.previous.cost,
      prevCpa: c.previous.cpa,
      prevRoas: c.previous.roas,
      note: c.note,
    })),
    color,
  );

  addSheet(
    workbook,
    'Keywords',
    [
      { header: 'Keyword', key: 'text', width: 32 },
      { header: 'Campaign', key: 'campaign', width: 32 },
      { header: 'Match type', key: 'matchType', width: 12 },
      { header: 'Quality Score', key: 'qualityScore', width: 13, numFmt: INT_FMT },
      ...metricColumns(),
    ],
    data.keywords.map((k) => ({
      text: k.text,
      campaign: k.campaign,
      matchType: k.matchType,
      qualityScore: k.qualityScore,
      ...k.metrics,
    })),
    color,
  );

  addSheet(
    workbook,
    'Search terms',
    [
      { header: 'Search term', key: 'term', width: 36 },
      { header: 'Campaign', key: 'campaign', width: 32 },
      ...metricColumns(),
      { header: 'Flag', key: 'flag', width: 20 },
      { header: 'Reason', key: 'reason', width: 60 },
    ],
    data.searchTerms.map((t) => ({
      term: t.term,
      campaign: t.campaign,
      ...t.metrics,
      flag: t.flag,
      reason: t.reason,
    })),
    color,
  );

  addSheet(
    workbook,
    'Landing pages',
    [
      { header: 'URL', key: 'url', width: 50 },
      ...metricColumns(),
      { header: 'GA4 sessions', key: 'sessions', width: 13, numFmt: INT_FMT },
      { header: 'Bounce rate', key: 'bounceRate', width: 12, numFmt: PCT_FMT },
      { header: 'GA4 joined', key: 'joined', width: 11 },
    ],
    data.landingPages.map((p) => ({
      url: p.url,
      ...p.metrics,
      sessions: p.sessions,
      bounceRate: p.bounceRate,
      joined: p.joined ? 'Yes' : 'Not available',
    })),
    color,
  );

  addSheet(
    workbook,
    'Alerts',
    [
      { header: 'Severity', key: 'severity', width: 11 },
      { header: 'Type', key: 'type', width: 30 },
      { header: 'Entity', key: 'entity', width: 34 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Created', key: 'createdAt', width: 22 },
      { header: 'Explanation', key: 'explanation', width: 80 },
    ],
    data.alerts,
    color,
  );

  addSheet(
    workbook,
    'Actions',
    [
      { header: 'Action', key: 'title', width: 40 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Completed', key: 'completedAt', width: 22 },
      { header: 'Result', key: 'classification', width: 14 },
      { header: 'Notes', key: 'result', width: 60 },
    ],
    data.completedActions,
    color,
  );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
