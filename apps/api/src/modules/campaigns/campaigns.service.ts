import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@adpulse/database';
import { compareKpis } from '@adpulse/kpi';
import type {
  CampaignDetailDto,
  CampaignRowDto,
  CampaignStatus,
  ChangeLogDto,
  DimensionRowDto,
  Paginated,
} from '@adpulse/types';
import { toCsv } from '../../common/csv';
import { type MetricsPageQueryDto, type MetricsQueryDto, pageMeta, paginateArray } from '../../common/dto';
import { CHANGE_LOG_INCLUDE, toChangeLogDto } from '../../common/entity-mappers';
import { isoDate, num } from '../../common/mappers';
import type { OrgContext } from '../../common/request-context';
import { matchesSearch, sortRows } from '../../common/sorting';
import { PrismaService } from '../../infra/prisma.service';
import { type BreakdownDimension, MetricsService } from '../analytics/metrics.service';

export type CampaignBreakdown = Exclude<BreakdownDimension, 'campaign'>;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly db: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /** All campaigns matching the filters, including those without spend in the range. */
  async rows(
    org: OrgContext,
    query: MetricsQueryDto & { status?: CampaignStatus; search?: string },
  ): Promise<CampaignRowDto[]> {
    const q = await this.metrics.resolve(org, query);
    const repo = this.metrics.repo;
    const [campaigns, current, previous, alertCounts] = await Promise.all([
      this.db.campaign.findMany({
        where: {
          organizationId: org.organizationId,
          ...(q.campaignIds ? { id: { in: q.campaignIds } } : {}),
          ...(query.adAccountId ? { adAccountId: query.adAccountId } : {}),
          ...(query.status ? { status: query.status } : { status: { not: 'REMOVED' } }),
        },
        include: { adAccount: { select: { name: true } } },
      }),
      repo.groupBy(q.filters, q.range, 'campaign', { campaignIds: q.campaignIds }),
      q.previous
        ? repo.groupBy(q.filters, q.previous, 'campaign', { campaignIds: q.campaignIds })
        : Promise.resolve(null),
      this.db.alert.groupBy({
        by: ['campaignId'],
        where: {
          organizationId: org.organizationId,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          campaignId: { not: null },
        },
        _count: { _all: true },
      }),
    ]);
    const currentMap = new Map(current.map((r) => [r.key, r]));
    const previousMap = previous ? new Map(previous.map((r) => [r.key, r])) : null;
    const alertMap = new Map(alertCounts.map((a) => [a.campaignId, a._count._all]));

    return campaigns
      .filter((c) => matchesSearch(c.name, query.search))
      .map((c) => ({
        id: c.id,
        externalId: c.externalId,
        name: c.name,
        adAccountId: c.adAccountId,
        adAccountName: c.adAccount.name,
        status: c.status,
        objective: c.objective,
        channelType: c.channelType,
        dailyBudget: num(c.dailyBudget),
        currencyCode: org.currencyCode,
        current: this.metrics.kpis(currentMap.get(c.id)),
        previous: previousMap ? this.metrics.kpis(previousMap.get(c.id)) : null,
        openAlerts: alertMap.get(c.id) ?? 0,
      }));
  }

  async list(
    org: OrgContext,
    query: MetricsPageQueryDto & { status?: CampaignStatus },
  ): Promise<Paginated<CampaignRowDto>> {
    const rows = await this.rows(org, query);
    const sorted = sortRows(rows, query.sortBy, query.sortDir, (r) => r.current, {
      name: (r) => r.name,
      status: (r) => r.status,
      objective: (r) => r.objective,
      adAccountName: (r) => r.adAccountName,
    });
    return paginateArray(sorted, query.page, query.pageSize);
  }

  async exportCsv(
    org: OrgContext,
    query: MetricsQueryDto & { status?: CampaignStatus; search?: string },
  ): Promise<string> {
    const rows = sortRows(await this.rows(org, query), 'cost', 'desc', (r) => r.current);
    return toCsv(
      [
        'Campaign',
        'Account',
        'Status',
        'Objective',
        'Channel',
        'Impressions',
        'Clicks',
        `Cost (${org.currencyCode})`,
        'Conversions',
        'Conversion value',
        'CTR %',
        'CPC',
        'Conversion rate %',
        'CPA',
        'ROAS',
      ],
      rows.map((r) => [
        r.name,
        r.adAccountName,
        r.status,
        r.objective,
        r.channelType,
        r.current.impressions,
        r.current.clicks,
        r.current.cost,
        r.current.conversions,
        r.current.conversionValue,
        r.current.ctr,
        r.current.cpc,
        r.current.conversionRate,
        r.current.cpa,
        r.current.roas,
      ]),
    );
  }

  private async findCampaign(organizationId: string, id: string) {
    const campaign = await this.db.campaign.findFirst({
      where: { id, organizationId },
      include: { adAccount: { select: { name: true } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async detail(org: OrgContext, id: string, query: MetricsQueryDto): Promise<CampaignDetailDto> {
    const campaign = await this.findCampaign(org.organizationId, id);
    const q = await this.metrics.resolve(org, { ...query, adAccountId: undefined }, [campaign.id]);
    const repo = this.metrics.repo;
    const [current, previous, daily, share, targets, openAlerts] = await Promise.all([
      repo.totals(q.filters, q.range, q.campaignIds),
      q.previous ? repo.totals(q.filters, q.previous, q.campaignIds) : Promise.resolve(null),
      repo.daily(q.filters, q.range, q.campaignIds),
      repo.impressionShare(org.organizationId, q.range, [campaign.id]),
      this.metrics.targets(org.organizationId),
      this.db.alert.count({
        where: {
          organizationId: org.organizationId,
          campaignId: campaign.id,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
      }),
    ]);
    const currentKpis = this.metrics.kpis(current);
    const previousKpis = previous ? this.metrics.kpis(previous) : null;
    const is = share[0];
    const toShare = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));
    return {
      id: campaign.id,
      externalId: campaign.externalId,
      name: campaign.name,
      adAccountId: campaign.adAccountId,
      adAccountName: campaign.adAccount.name,
      status: campaign.status,
      objective: campaign.objective,
      channelType: campaign.channelType,
      dailyBudget: num(campaign.dailyBudget),
      currencyCode: org.currencyCode,
      current: currentKpis,
      previous: previousKpis,
      openAlerts,
      startDate: isoDate(campaign.startDate),
      searchImpressionShare: toShare(is?.searchImpressionShare),
      searchTopImpressionShare: toShare(is?.searchTopImpressionShare),
      searchAbsoluteTopImpressionShare: toShare(is?.searchAbsoluteTopImpressionShare),
      searchBudgetLostImpressionShare: toShare(is?.searchBudgetLostImpressionShare),
      targets: targets.forEntity({ adAccountId: campaign.adAccountId, campaignId: campaign.id }),
      trend: daily.map((d) => ({ date: d.date, ...this.metrics.kpis(d.totals) })),
      change: previousKpis ? compareKpis(currentKpis, previousKpis) : null,
    };
  }

  async breakdown(
    org: OrgContext,
    id: string,
    dimension: CampaignBreakdown,
    query: MetricsQueryDto,
  ): Promise<DimensionRowDto[]> {
    const campaign = await this.findCampaign(org.organizationId, id);
    const q = await this.metrics.resolve(org, { ...query, adAccountId: undefined }, [campaign.id]);
    const rows = await this.metrics.repo.groupBy(q.filters, q.range, dimension, {
      campaignIds: q.campaignIds,
    });
    const labels = await this.metrics.dimensionLabels(
      org.organizationId,
      dimension,
      rows.map((r) => r.key),
    );
    return rows
      .map((r) => ({ key: r.key, label: labels.get(r.key) ?? r.key, metrics: this.metrics.kpis(r) }))
      .sort((a, b) => b.metrics.cost - a.metrics.cost)
      .slice(0, 200);
  }

  async changes(
    org: OrgContext,
    id: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<ChangeLogDto>> {
    const campaign = await this.findCampaign(org.organizationId, id);
    const where: Prisma.ChangeLogWhereInput = {
      organizationId: org.organizationId,
      OR: [{ campaignId: campaign.id }, { entityType: 'CAMPAIGN', entityId: campaign.id }],
    };
    const [total, items] = await Promise.all([
      this.db.changeLog.count({ where }),
      this.db.changeLog.findMany({
        where,
        include: CHANGE_LOG_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: items.map(toChangeLogDto), meta: pageMeta(page, pageSize, total) };
  }
}
