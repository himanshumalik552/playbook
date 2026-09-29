import type { PrismaClient } from '@adpulse/database';
import { compareKpis, deviationFromTarget, meetsTarget, previousPeriod, toKpiValues } from '@adpulse/kpi';
import { DEFAULT_BRANDING } from '@adpulse/types';
import type {
  BrandingSettings,
  DailyPoint,
  DateRange,
  ReportCampaignRow,
  ReportData,
  ReportFrequency,
} from '@adpulse/types';
import { MetricsRepository, type MetricFilters } from '../metrics/metrics-repository';
import { classifySearchTerm } from '../search-terms/classify';
import { loadTargets } from '../targets/targets';

export type { ReportCampaignRow, ReportData };

export interface ReportRequest {
  organizationId: string;
  title: string;
  frequency: ReportFrequency;
  period: DateRange;
  adAccountId?: string | null;
  campaignIds?: string[];
  commentary?: string | null;
}

const EMPTY = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 };

export class ReportDataService {
  private readonly metrics: MetricsRepository;

  constructor(private readonly db: PrismaClient) {
    this.metrics = new MetricsRepository(db);
  }

  async build(request: ReportRequest, now = new Date()): Promise<ReportData> {
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: request.organizationId } });
    const filters: MetricFilters = {
      organizationId: org.id,
      ...(request.adAccountId ? { adAccountId: request.adAccountId } : {}),
      ...(request.campaignIds?.length ? { campaignIds: request.campaignIds } : {}),
    };
    const prior = previousPeriod(request.period);
    const campaignIds = await this.metrics.resolveCampaignIds(filters);

    const [current, previous, daily, campaignNow, campaignPrev, targets] = await Promise.all([
      this.metrics.totals(filters, request.period, campaignIds),
      this.metrics.totals(filters, prior, campaignIds),
      this.metrics.daily(filters, request.period, campaignIds),
      this.metrics.groupBy(filters, request.period, 'campaign', { campaignIds }),
      this.metrics.groupBy(filters, prior, 'campaign', { campaignIds }),
      loadTargets(this.db, org.id),
    ]);

    const currentKpis = toKpiValues(current);
    const previousKpis = toKpiValues(previous);
    const campaignEntities = await this.db.campaign.findMany({
      where: { organizationId: org.id, id: { in: campaignNow.map((c) => c.key) } },
      include: { adAccount: { select: { name: true } } },
    });
    const prevMap = new Map(campaignPrev.map((c) => [c.key, c]));
    const nowMap = new Map(campaignNow.map((c) => [c.key, c]));

    const scope = {
      adAccountId: request.adAccountId ?? null,
      campaignId: request.campaignIds?.length === 1 ? request.campaignIds[0] : null,
    };
    const campaigns: ReportCampaignRow[] = campaignEntities
      .map((c) => {
        const cur = toKpiValues(nowMap.get(c.id) ?? EMPTY);
        const cpaTarget = targets.get('CPA', { adAccountId: c.adAccountId, campaignId: c.id });
        const roasTarget = targets.get('ROAS', { adAccountId: c.adAccountId, campaignId: c.id });
        let note: string | null = null;
        if (cur.cost > 0 && cur.conversions === 0) note = 'Spend without conversions';
        else if (cur.cpa !== null && cur.cpa > cpaTarget * 1.15)
          note = `CPA ${Math.round(deviationFromTarget(cur.cpa, cpaTarget) ?? 0)}% above target`;
        else if (cur.roas !== null && cur.roas < roasTarget * 0.85)
          note = `ROAS ${Math.round(Math.abs(deviationFromTarget(cur.roas, roasTarget) ?? 0))}% below target`;
        return {
          id: c.id,
          name: c.name,
          accountName: c.adAccount.name,
          objective: c.objective,
          status: c.status,
          current: cur,
          previous: toKpiValues(prevMap.get(c.id) ?? EMPTY),
          note,
        };
      })
      .sort((a, b) => b.current.cost - a.current.cost);

    const top = [...campaigns]
      .filter((c) => c.current.conversions > 0 && !c.note)
      .sort((a, b) => (b.current.roas ?? 0) - (a.current.roas ?? 0))
      .slice(0, 5);
    const under = campaigns.filter((c) => c.note !== null).slice(0, 8);

    const targetRows = (
      [
        ['CPA', 'Cost per acquisition', currentKpis.cpa, 'lower'],
        ['ROAS', 'Return on ad spend', currentKpis.roas, 'higher'],
        ['CTR', 'Click-through rate', currentKpis.ctr, 'higher'],
        ['CONVERSION_RATE', 'Conversion rate', currentKpis.conversionRate, 'higher'],
      ] as const
    ).map(([metric, label, actual, direction]) => {
      const target = targets.get(metric, scope);
      return {
        metric,
        label,
        target,
        actual,
        met: meetsTarget(actual, target, direction),
        deviation: deviationFromTarget(actual, target),
      };
    });

    const [keywordRows, termRows, pageRows] = await Promise.all([
      this.metrics.groupBy(filters, request.period, 'keyword', { campaignIds }),
      this.metrics.groupBy(filters, request.period, 'searchTerm', { campaignIds }),
      this.metrics.landingPageAnalytics(filters, request.period, campaignIds),
    ]);
    const topKeywords = keywordRows.sort((a, b) => Number(b.cost) - Number(a.cost)).slice(0, 50);
    const topTerms = termRows.sort((a, b) => Number(b.cost) - Number(a.cost)).slice(0, 50);
    const [keywordEntities, termEntities, pageEntities] = await Promise.all([
      this.db.keyword.findMany({
        where: { organizationId: org.id, id: { in: topKeywords.map((k) => k.key) } },
        include: { campaign: { select: { name: true, adAccountId: true } } },
      }),
      this.db.searchTerm.findMany({
        where: { organizationId: org.id, id: { in: topTerms.map((t) => t.key) } },
        include: { campaign: { select: { name: true, adAccountId: true, id: true } } },
      }),
      this.db.landingPage.findMany({
        where: { organizationId: org.id, id: { in: pageRows.map((p) => p.key) } },
      }),
    ]);
    const keywordMap = new Map(keywordEntities.map((k) => [k.id, k]));
    const termMap = new Map(termEntities.map((t) => [t.id, t]));
    const pageMap = new Map(pageEntities.map((p) => [p.id, p.url]));

    const [alerts, actions, recommendations, lastSync, lastMetricDate] = await Promise.all([
      this.db.alert.findMany({
        where: {
          organizationId: org.id,
          ...(request.adAccountId ? { adAccountId: request.adAccountId } : {}),
          OR: [
            { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
            { createdAt: { gte: new Date(`${request.period.from}T00:00:00Z`) } },
          ],
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 12,
      }),
      this.db.optimizationAction.findMany({
        where: {
          organizationId: org.id,
          deletedAt: null,
          OR: [
            {
              status: { in: ['COMPLETED', 'EVALUATED'] },
              completedAt: { gte: new Date(`${request.period.from}T00:00:00Z`) },
            },
            { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
          ],
        },
        include: { owner: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
      this.db.recommendation.findMany({
        where: { organizationId: org.id, status: { in: ['OPEN', 'APPROVED'] } },
        orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      this.db.syncJob.findFirst({
        where: { organizationId: org.id, status: 'SUCCEEDED' },
        orderBy: { finishedAt: 'desc' },
      }),
      this.metrics.lastMetricDate(org.id, request.adAccountId ?? undefined),
    ]);

    const today = now.toISOString().slice(0, 10);
    const completed = actions.filter((a) => a.status === 'COMPLETED' || a.status === 'EVALUATED');
    const overdue = actions.filter(
      (a) =>
        (a.status === 'PLANNED' || a.status === 'IN_PROGRESS') &&
        a.plannedDate &&
        a.plannedDate.toISOString().slice(0, 10) < today,
    );
    const failedSyncs = await this.db.syncJob.count({
      where: {
        organizationId: org.id,
        status: 'FAILED',
        createdAt: { gte: new Date(`${request.period.from}T00:00:00Z`) },
      },
    });
    const risks = [
      ...alerts
        .filter((a) => a.severity === 'CRITICAL' && a.status !== 'RESOLVED' && a.status !== 'DISMISSED')
        .map((a) => a.explanation),
      ...overdue.map(
        (a) => `Action "${a.title}" is past its planned date (${a.plannedDate?.toISOString().slice(0, 10)}).`,
      ),
      ...(failedSyncs > 0
        ? [`${failedSyncs} synchronization job(s) failed during the period; affected data may be incomplete.`]
        : []),
    ].slice(0, 10);

    const nextActions = [
      ...recommendations.map((r) => r.title),
      ...actions.filter((a) => a.status === 'PLANNED').map((a) => `Planned: ${a.title}`),
    ].slice(0, 8);

    const stale = !lastMetricDate || lastMetricDate < request.period.to;
    const branding = { ...DEFAULT_BRANDING, ...(org.branding as Partial<BrandingSettings>) };
    const trend: DailyPoint[] = daily.map((d) => ({ date: d.date, ...toKpiValues(d.totals) }));
    const accountName = request.adAccountId
      ? ((await this.db.adAccount.findFirst({ where: { id: request.adAccountId, organizationId: org.id } }))
          ?.name ?? null)
      : null;

    return {
      title: request.title,
      organizationName: org.name,
      currencyCode: org.currencyCode,
      timezone: org.timezone,
      branding,
      frequency: request.frequency,
      period: request.period,
      previousPeriod: prior,
      filters: {
        adAccount: accountName,
        campaigns: request.campaignIds?.length
          ? campaignEntities.filter((c) => request.campaignIds?.includes(c.id)).map((c) => c.name)
          : [],
      },
      kpis: { current: currentKpis, previous: previousKpis, change: compareKpis(currentKpis, previousKpis) },
      targets: targetRows,
      trend,
      topCampaigns: top,
      underperformingCampaigns: under,
      campaigns,
      keywords: topKeywords.map((k) => {
        const entity = keywordMap.get(k.key);
        return {
          text: entity?.text ?? k.key,
          campaign: entity?.campaign.name ?? '—',
          matchType: entity?.matchType ?? '—',
          qualityScore: entity?.qualityScore ?? null,
          metrics: toKpiValues(k),
        };
      }),
      searchTerms: topTerms.map((t) => {
        const entity = termMap.get(t.key);
        const m = toKpiValues(t);
        const cls = classifySearchTerm(
          m,
          targets.get('CPA', { adAccountId: entity?.campaign.adAccountId, campaignId: entity?.campaign.id }),
          org.currencyCode,
        );
        return {
          term: entity?.term ?? t.key,
          campaign: entity?.campaign.name ?? '—',
          flag: cls.flag,
          reason: cls.reason,
          metrics: m,
        };
      }),
      landingPages: pageRows
        .map((p) => {
          const sessions = p.sessions === null ? null : Number(p.sessions);
          const engaged = p.engagedSessions === null ? null : Number(p.engagedSessions);
          return {
            url: pageMap.get(p.key) ?? p.key,
            metrics: toKpiValues(p),
            sessions,
            bounceRate: sessions && engaged !== null ? (1 - engaged / sessions) * 100 : null,
            joined: p.joined,
          };
        })
        .sort((a, b) => b.metrics.cost - a.metrics.cost),
      alerts: alerts.map((a) => ({
        severity: a.severity,
        type: a.type,
        entity: a.entityName,
        explanation: a.explanation,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
      })),
      completedActions: completed.map((a) => ({
        title: a.title,
        status: a.status,
        owner: a.owner?.name ?? null,
        completedAt: a.completedAt?.toISOString() ?? null,
        result: a.actualResult,
        classification: a.resultClassification,
      })),
      risks,
      nextActions,
      dataFreshness: {
        lastMetricDate,
        lastSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
        note: stale
          ? `Data is available through ${lastMetricDate ?? 'no date'}; days after that are not yet included. Google Ads conversions can be revised for up to 30 days.`
          : 'Data covers the full reporting period. Google Ads conversions can be revised for up to 30 days after the click.',
      },
      commentary: request.commentary ?? '',
      generatedAt: now.toISOString(),
    };
  }
}
