import { Injectable } from '@nestjs/common';
import {
  type Dimension,
  loadTargets,
  type MetricFilters,
  MetricsRepository,
  type TargetResolver,
} from '@adpulse/core';
import { Prisma } from '@adpulse/database';
import { addDays, isoDateInTimezone, previousPeriod, toKpiValues } from '@adpulse/kpi';
import type { DataFreshnessDto, DateRange, KpiValues } from '@adpulse/types';
import { assertRange, type MetricsQueryDto } from '../../common/dto';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';

export interface ResolvedQuery {
  filters: MetricFilters;
  range: DateRange;
  previous: DateRange | null;
  /** null = no campaign restriction. */
  campaignIds: string[] | null;
}

export type BreakdownDimension = Exclude<Dimension, 'date' | 'adAccount'>;

const ZERO = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 };

@Injectable()
export class MetricsService {
  readonly repo: MetricsRepository;

  constructor(private readonly db: PrismaService) {
    this.repo = new MetricsRepository(db);
  }

  /** Organization id always comes from the verified membership context, never from query parameters. */
  async resolve(
    org: OrgContext,
    query: MetricsQueryDto,
    extraCampaignIds?: string[],
  ): Promise<ResolvedQuery> {
    const range = assertRange(query);
    const campaignFilter = extraCampaignIds ?? query.campaignIds;
    const filters: MetricFilters = {
      organizationId: org.organizationId,
      ...(query.adAccountId ? { adAccountId: query.adAccountId } : {}),
      ...(campaignFilter?.length ? { campaignIds: campaignFilter } : {}),
      ...(query.device ? { device: query.device } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.objective ? { objective: query.objective } : {}),
    };
    return {
      filters,
      range,
      previous: query.compare ? previousPeriod(range) : null,
      campaignIds: await this.repo.resolveCampaignIds(filters),
    };
  }

  kpis(row: Parameters<typeof toKpiValues>[0] | undefined): KpiValues {
    return toKpiValues(row ?? ZERO);
  }

  targets(organizationId: string): Promise<TargetResolver> {
    return loadTargets(this.db, organizationId);
  }

  /** Latest known name per location id; all locations when `ids` is omitted. */
  async locationNames(organizationId: string, ids?: string[]): Promise<Map<string, string>> {
    if (ids?.length === 0) return new Map();
    const idFilter = ids ? Prisma.sql`AND m."locationId" IN (${Prisma.join(ids)})` : Prisma.empty;
    const rows = await this.db.$queryRaw<{ locationId: string; locationName: string }[]>(Prisma.sql`
      SELECT DISTINCT ON (m."locationId") m."locationId", m."locationName"
      FROM "LocationDailyMetric" m
      WHERE m."organizationId" = ${organizationId} ${idFilter}
      ORDER BY m."locationId", m."date" DESC`);
    return new Map(rows.map((r) => [r.locationId, r.locationName]));
  }

  /** Human-readable labels for breakdown keys, always scoped to the organization. */
  async dimensionLabels(
    organizationId: string,
    dimension: BreakdownDimension,
    keys: string[],
  ): Promise<Map<string, string>> {
    const where = { organizationId, id: { in: keys } };
    switch (dimension) {
      case 'device':
        return new Map(keys.map((k) => [k, k.charAt(0) + k.slice(1).toLowerCase()]));
      case 'location':
        return this.locationNames(organizationId, keys);
      case 'campaign':
        return new Map(
          (await this.db.campaign.findMany({ where, select: { id: true, name: true } })).map((c) => [
            c.id,
            c.name,
          ]),
        );
      case 'adGroup':
        return new Map(
          (await this.db.adGroup.findMany({ where, select: { id: true, name: true } })).map((g) => [
            g.id,
            g.name,
          ]),
        );
      case 'keyword':
        return new Map(
          (await this.db.keyword.findMany({ where, select: { id: true, text: true, matchType: true } })).map(
            (k) => [k.id, `${k.text} (${k.matchType.toLowerCase()})`],
          ),
        );
      case 'searchTerm':
        return new Map(
          (await this.db.searchTerm.findMany({ where, select: { id: true, term: true } })).map((t) => [
            t.id,
            t.term,
          ]),
        );
      case 'landingPage':
        return new Map(
          (await this.db.landingPage.findMany({ where, select: { id: true, url: true } })).map((p) => [
            p.id,
            p.url,
          ]),
        );
    }
  }

  /** Data is stale when the newest metric day is more than two days behind "today" in the organization timezone. */
  async freshness(org: OrgContext, adAccountId?: string): Promise<DataFreshnessDto> {
    const [lastMetricDate, lastSync] = await Promise.all([
      this.repo.lastMetricDate(org.organizationId, adAccountId),
      this.db.syncJob.findFirst({
        where: {
          organizationId: org.organizationId,
          status: { in: ['SUCCEEDED', 'PARTIAL'] },
          ...(adAccountId ? { adAccountId } : {}),
        },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      }),
    ]);
    const today = isoDateInTimezone(new Date(), org.timezone);
    return {
      lastMetricDate,
      lastSuccessfulSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
      isStale: !lastMetricDate || lastMetricDate < addDays(today, -2),
    };
  }
}
