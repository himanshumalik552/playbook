import { type Prisma, type PrismaClient } from '@adpulse/database';
import { addDays, toKpiValues } from '@adpulse/kpi';
import type { Logger } from '../logger';
import { MetricsRepository } from '../metrics/metrics-repository';
import { loadTargets } from '../targets/targets';
import { generateRecommendations, type RecommendationCandidate, type RecommendationInput } from './rules';

const WINDOW_DAYS = 14;
const BASELINE_DAYS = 28;
const DISMISS_SUPPRESSION_DAYS = 30;

const DEVICE_LABELS: Record<string, string> = {
  DESKTOP: 'Desktop',
  MOBILE: 'Mobile',
  TABLET: 'Tablet',
  OTHER: 'Other devices',
};

export class RecommendationService {
  private readonly metrics: MetricsRepository;

  constructor(
    private readonly db: PrismaClient,
    private readonly logger: Logger,
  ) {
    this.metrics = new MetricsRepository(db);
  }

  async buildInput(organizationId: string): Promise<RecommendationInput | null> {
    const anchor = await this.metrics.lastMetricDate(organizationId);
    if (!anchor) return null;
    const window = { from: addDays(anchor, -(WINDOW_DAYS - 1)), to: anchor };
    const baseline = { from: addDays(window.from, -BASELINE_DAYS), to: addDays(window.from, -1) };
    const filters = { organizationId };

    const [campaigns, accounts, targets] = await Promise.all([
      this.db.campaign.findMany({
        where: { organizationId, status: 'ENABLED', adAccount: { isActive: true } },
      }),
      this.db.adAccount.findMany({ where: { organizationId } }),
      loadTargets(this.db, organizationId),
    ]);
    const ids = campaigns.map((c) => c.id);
    const currency = new Map(accounts.map((a) => [a.id, a.currencyCode]));

    const [campaignRows, shares, terms, keywords, devices, locations, pagesNow, pagesBefore] =
      await Promise.all([
        this.metrics.groupBy(filters, window, 'campaign', { campaignIds: ids }),
        this.metrics.impressionShare(organizationId, window, ids),
        this.metrics.groupByCampaignSegment(filters, window, 'searchTerm', ids),
        this.metrics.groupByCampaignSegment(filters, window, 'keyword', ids),
        this.metrics.groupByCampaignSegment(filters, window, 'device', ids),
        this.metrics.groupByCampaignSegment(filters, window, 'location', ids),
        this.metrics.groupByCampaignSegment(filters, window, 'landingPage', ids),
        this.metrics.groupByCampaignSegment(filters, baseline, 'landingPage', ids),
      ]);

    const [termEntities, keywordEntities, pageEntities, locationNames] = await Promise.all([
      this.db.searchTerm.findMany({
        where: { organizationId, id: { in: terms.map((t) => t.key) } },
        select: { id: true, term: true, reviewedAt: true },
      }),
      this.db.keyword.findMany({
        where: { organizationId, id: { in: keywords.map((k) => k.key) } },
        select: { id: true, text: true, qualityScore: true },
      }),
      this.db.landingPage.findMany({ where: { organizationId }, select: { id: true, url: true } }),
      this.db.locationDailyMetric.findMany({
        where: { organizationId, date: { gte: new Date(`${window.from}T00:00:00Z`) } },
        distinct: ['locationId'],
        select: { locationId: true, locationName: true },
      }),
    ]);
    const termMap = new Map(termEntities.map((t) => [t.id, t]));
    const keywordMap = new Map(keywordEntities.map((k) => [k.id, k]));
    const pageMap = new Map(pageEntities.map((p) => [p.id, p.url]));
    const locationMap = new Map(locationNames.map((l) => [l.locationId, l.locationName]));
    const current = new Map(campaignRows.map((r) => [r.key, r]));
    const shareMap = new Map(shares.map((s) => [s.key, s]));
    const baselinePages = new Map(pagesBefore.map((p) => [`${p.campaignId}|${p.key}`, p]));
    const empty = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 };

    return {
      window,
      campaigns: campaigns.map((c) => {
        const lost = shareMap.get(c.id)?.searchBudgetLostImpressionShare;
        return {
          id: c.id,
          name: c.name,
          adAccountId: c.adAccountId,
          currencyCode: currency.get(c.adAccountId) ?? 'USD',
          current: toKpiValues(current.get(c.id) ?? empty),
          targetCpa: targets.get('CPA', { adAccountId: c.adAccountId, campaignId: c.id }),
          targetRoas: targets.get('ROAS', { adAccountId: c.adAccountId, campaignId: c.id }),
          budgetLostImpressionShare: lost ? Number(lost) : null,
          dailyBudget: c.dailyBudget ? Number(c.dailyBudget.toString()) : null,
        };
      }),
      searchTerms: terms
        .filter((t) => !termMap.get(t.key)?.reviewedAt)
        .map((t) => ({
          id: t.key,
          campaignId: t.campaignId,
          key: t.key,
          label: termMap.get(t.key)?.term ?? t.key,
          metrics: toKpiValues(t),
        })),
      keywords: keywords.map((k) => ({
        id: k.key,
        campaignId: k.campaignId,
        text: keywordMap.get(k.key)?.text ?? k.key,
        qualityScore: keywordMap.get(k.key)?.qualityScore ?? null,
        metrics: toKpiValues(k),
      })),
      devices: devices.map((d) => ({
        campaignId: d.campaignId,
        key: d.key,
        label: DEVICE_LABELS[d.key] ?? d.key,
        metrics: toKpiValues(d),
      })),
      locations: locations.map((l) => ({
        campaignId: l.campaignId,
        key: l.key,
        label: locationMap.get(l.key) ?? l.key,
        metrics: toKpiValues(l),
      })),
      landingPages: pagesNow.map((p) => ({
        id: p.key,
        url: pageMap.get(p.key) ?? p.key,
        campaignId: p.campaignId,
        current: toKpiValues(p),
        baseline: toKpiValues(baselinePages.get(`${p.campaignId}|${p.key}`) ?? empty),
      })),
    };
  }

  async generate(
    organizationId: string,
    now = new Date(),
  ): Promise<{ created: number; updated: number; candidates: RecommendationCandidate[] }> {
    const input = await this.buildInput(organizationId);
    if (!input) return { created: 0, updated: 0, candidates: [] };
    const candidates = generateRecommendations(input);

    const existing = await this.db.recommendation.findMany({
      where: {
        organizationId,
        fingerprint: { in: candidates.map((c) => c.fingerprint) },
        OR: [
          { status: { in: ['OPEN', 'APPROVED', 'CONVERTED'] } },
          {
            status: 'DISMISSED',
            decidedAt: { gte: new Date(now.getTime() - DISMISS_SUPPRESSION_DAYS * 86_400_000) },
          },
        ],
      },
      select: { id: true, fingerprint: true, status: true },
    });
    const byFingerprint = new Map(existing.map((r) => [r.fingerprint, r]));

    let created = 0;
    let updated = 0;
    for (const c of candidates) {
      const data = {
        title: c.title,
        rationale: c.rationale,
        evidence: c.evidence as unknown as Prisma.InputJsonValue,
        affectedMetrics: c.affectedMetrics,
        confidence: c.confidence,
        entityName: c.entityName,
      };
      const match = byFingerprint.get(c.fingerprint);
      if (match) {
        if (match.status === 'OPEN') {
          await this.db.recommendation.update({ where: { id: match.id }, data });
          updated += 1;
        }
        continue;
      }
      await this.db.recommendation.create({
        data: {
          ...data,
          organizationId,
          type: c.type,
          adAccountId: c.adAccountId,
          campaignId: c.campaignId,
          entityType: c.entityType,
          entityId: c.entityId,
          fingerprint: c.fingerprint,
        },
      });
      created += 1;
    }
    this.logger.info({ organizationId, created, updated }, 'Recommendations generated');
    return { created, updated, candidates };
  }
}
