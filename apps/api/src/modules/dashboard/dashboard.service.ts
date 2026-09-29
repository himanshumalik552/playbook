import { Injectable } from '@nestjs/common';
import { compareKpis, sumTotals } from '@adpulse/kpi';
import {
  CAMPAIGN_OBJECTIVES,
  type CampaignObjective,
  DEVICES,
  OBJECTIVE_LABELS,
  type DashboardOverviewDto,
  type DashboardSummaryDto,
  type DimensionRowDto,
  type FilterOptionsDto,
} from '@adpulse/types';
import type { MetricsQueryDto } from '../../common/dto';
import {
  ACTION_LIST_INCLUDE,
  ALERT_INCLUDE,
  RECOMMENDATION_INCLUDE,
  SYNC_JOB_INCLUDE,
  toActionListItem,
  toAlertDto,
  toRecommendationDto,
  toSyncJobDto,
} from '../../common/entity-mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import { MetricsService } from '../analytics/metrics.service';

export type DashboardDimension = 'campaign' | 'adAccount' | 'device' | 'location' | 'objective';

@Injectable()
export class DashboardService {
  constructor(
    private readonly db: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async overview(org: OrgContext, query: MetricsQueryDto): Promise<DashboardOverviewDto> {
    const q = await this.metrics.resolve(org, query);
    const repo = this.metrics.repo;
    const [current, daily, previous, previousDaily, freshness] = await Promise.all([
      repo.totals(q.filters, q.range, q.campaignIds),
      repo.daily(q.filters, q.range, q.campaignIds),
      q.previous ? repo.totals(q.filters, q.previous, q.campaignIds) : Promise.resolve(null),
      q.previous ? repo.daily(q.filters, q.previous, q.campaignIds) : Promise.resolve(null),
      this.metrics.freshness(org, query.adAccountId),
    ]);
    const currentKpis = this.metrics.kpis(current);
    const previousKpis = previous ? this.metrics.kpis(previous) : null;
    return {
      range: q.range,
      previousRange: q.previous,
      currencyCode: org.currencyCode,
      timezone: org.timezone,
      kpis: {
        current: currentKpis,
        previous: previousKpis,
        change: previousKpis ? compareKpis(currentKpis, previousKpis) : null,
      },
      trend: daily.map((d) => ({ date: d.date, ...this.metrics.kpis(d.totals) })),
      previousTrend: previousDaily?.map((d) => ({ date: d.date, ...this.metrics.kpis(d.totals) })) ?? null,
      dataFreshness: freshness,
      source: repo.sourceFor(q.filters),
    };
  }

  async summary(org: OrgContext): Promise<DashboardSummaryDto> {
    const organizationId = org.organizationId;
    const openStatuses = { in: ['OPEN', 'ACKNOWLEDGED'] as ('OPEN' | 'ACKNOWLEDGED')[] };
    const [severityCounts, latestAlerts, openRecs, latestRecs, recentActions, lastSync] = await Promise.all([
      this.db.alert.groupBy({
        by: ['severity'],
        where: { organizationId, status: openStatuses },
        _count: { _all: true },
      }),
      this.db.alert.findMany({
        where: { organizationId, status: openStatuses },
        include: ALERT_INCLUDE,
        orderBy: [{ severity: 'desc' }, { lastDetectedAt: 'desc' }],
        take: 5,
      }),
      this.db.recommendation.count({ where: { organizationId, status: 'OPEN' } }),
      this.db.recommendation.findMany({
        where: { organizationId, status: 'OPEN' },
        include: RECOMMENDATION_INCLUDE,
        orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
        take: 3,
      }),
      this.db.optimizationAction.findMany({
        where: { organizationId, deletedAt: null },
        include: ACTION_LIST_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.db.syncJob.findFirst({
        where: { organizationId },
        include: SYNC_JOB_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const count = (severity: string) => severityCounts.find((c) => c.severity === severity)?._count._all ?? 0;
    return {
      alerts: {
        open: severityCounts.reduce((sum, c) => sum + c._count._all, 0),
        critical: count('CRITICAL'),
        warning: count('WARNING'),
        info: count('INFO'),
        latest: latestAlerts.map(toAlertDto),
      },
      recommendations: { open: openRecs, latest: latestRecs.map(toRecommendationDto) },
      recentActions: recentActions.map(toActionListItem),
      sync: lastSync ? toSyncJobDto(lastSync) : null,
    };
  }

  async filters(org: OrgContext): Promise<FilterOptionsDto> {
    const organizationId = org.organizationId;
    const [accounts, campaigns, locations] = await Promise.all([
      this.db.adAccount.findMany({
        where: { organizationId, isActive: true, isManager: false },
        orderBy: { name: 'asc' },
      }),
      this.db.campaign.findMany({
        where: { organizationId, status: { not: 'REMOVED' } },
        select: { id: true, name: true, adAccountId: true, objective: true },
        orderBy: { name: 'asc' },
      }),
      this.metrics.locationNames(organizationId),
    ]);
    return {
      adAccounts: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.customerId})` })),
      campaigns: campaigns.map((c) => ({
        value: c.id,
        label: c.name,
        adAccountId: c.adAccountId,
        objective: c.objective,
      })),
      devices: DEVICES.map((d) => ({ value: d, label: d.charAt(0) + d.slice(1).toLowerCase() })),
      locations: [...locations]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      objectives: CAMPAIGN_OBJECTIVES.map((o) => ({ value: o, label: OBJECTIVE_LABELS[o] })),
    };
  }

  async breakdown(
    org: OrgContext,
    query: MetricsQueryDto,
    dimension: DashboardDimension,
  ): Promise<DimensionRowDto[]> {
    const q = await this.metrics.resolve(org, query);
    const repo = this.metrics.repo;

    if (dimension === 'adAccount') {
      const [rows, accounts] = await Promise.all([
        repo.byAccount(q.filters, q.range),
        this.db.adAccount.findMany({
          where: { organizationId: org.organizationId },
          select: { id: true, name: true },
        }),
      ]);
      const names = new Map(accounts.map((a) => [a.id, a.name]));
      return rows.map((r) => ({
        key: r.key,
        label: names.get(r.key) ?? r.key,
        metrics: this.metrics.kpis(r),
      }));
    }

    if (dimension === 'objective') {
      const [rows, campaigns] = await Promise.all([
        repo.groupBy(q.filters, q.range, 'campaign', { campaignIds: q.campaignIds }),
        this.db.campaign.findMany({
          where: { organizationId: org.organizationId },
          select: { id: true, objective: true },
        }),
      ]);
      const objectiveOf = new Map(campaigns.map((c) => [c.id, c.objective]));
      const grouped = new Map<CampaignObjective, typeof rows>();
      for (const row of rows) {
        const objective = objectiveOf.get(row.key);
        if (objective) grouped.set(objective, [...(grouped.get(objective) ?? []), row]);
      }
      return [...grouped]
        .map(([key, group]) => ({
          key,
          label: OBJECTIVE_LABELS[key],
          metrics: this.metrics.kpis(sumTotals(group)),
        }))
        .sort((a, b) => b.metrics.cost - a.metrics.cost);
    }

    const rows = await repo.groupBy(q.filters, q.range, dimension, { campaignIds: q.campaignIds });
    const labels = await this.metrics.dimensionLabels(
      org.organizationId,
      dimension,
      rows.map((r) => r.key),
    );
    return rows
      .map((r) => ({ key: r.key, label: labels.get(r.key) ?? r.key, metrics: this.metrics.kpis(r) }))
      .sort((a, b) => b.metrics.cost - a.metrics.cost);
  }
}
