import { type DbClient, Prisma } from '@adpulse/database';
import { eachDay, type RawTotals } from '@adpulse/kpi';
import type { CampaignObjective, DateRange, Device } from '@adpulse/types';

export interface MetricFilters {
  organizationId: string;
  adAccountId?: string;
  campaignIds?: string[];
  device?: Device;
  locationId?: string;
  objective?: CampaignObjective;
}

export interface TotalsRow extends RawTotals {
  impressions: string;
  clicks: string;
  cost: string;
  conversions: string;
  conversionValue: string;
}

export type MetricSource = 'account' | 'campaign' | 'device' | 'location';

export type Dimension =
  | 'campaign'
  | 'adAccount'
  | 'adGroup'
  | 'keyword'
  | 'searchTerm'
  | 'device'
  | 'location'
  | 'landingPage'
  | 'date';

/** Whitelisted tables; identifiers are never derived from user input. */
const TABLES = {
  account: 'AccountDailyMetric',
  campaign: 'CampaignDailyMetric',
  device: 'DeviceDailyMetric',
  location: 'LocationDailyMetric',
  adGroup: 'AdGroupDailyMetric',
  keyword: 'KeywordDailyMetric',
  searchTerm: 'SearchTermDailyMetric',
  landingPage: 'LandingPageDailyMetric',
} as const;

type TableKey = keyof typeof TABLES;

const DIMENSION_TABLE: Record<
  Exclude<Dimension, 'date' | 'adAccount'>,
  { table: TableKey; column: string }
> = {
  campaign: { table: 'campaign', column: 'campaignId' },
  adGroup: { table: 'adGroup', column: 'adGroupId' },
  keyword: { table: 'keyword', column: 'keywordId' },
  searchTerm: { table: 'searchTerm', column: 'searchTermId' },
  device: { table: 'device', column: 'device' },
  location: { table: 'location', column: 'locationId' },
  landingPage: { table: 'landingPage', column: 'landingPageId' },
};

const SUMS = Prisma.sql`
  COALESCE(SUM(m."impressions"), 0)::text AS "impressions",
  COALESCE(SUM(m."clicks"), 0)::text AS "clicks",
  COALESCE(SUM(m."cost"), 0)::text AS "cost",
  COALESCE(SUM(m."conversions"), 0)::text AS "conversions",
  COALESCE(SUM(m."conversionValue"), 0)::text AS "conversionValue"`;

const ZERO: TotalsRow = { impressions: '0', clicks: '0', cost: '0', conversions: '0', conversionValue: '0' };

export class MetricsRepository {
  constructor(private readonly db: DbClient) {}

  /** Chooses the most specific table that can answer the filter combination. */
  sourceFor(filters: MetricFilters): MetricSource {
    if (filters.locationId) return 'location';
    if (filters.device) return 'device';
    if (filters.campaignIds?.length || filters.objective) return 'campaign';
    return 'account';
  }

  /** Resolves objective/campaign/account filters into an explicit campaign id list (null = no restriction). */
  async resolveCampaignIds(filters: MetricFilters): Promise<string[] | null> {
    if (!filters.objective && !filters.campaignIds?.length) return null;
    const campaigns = await this.db.campaign.findMany({
      where: {
        organizationId: filters.organizationId,
        ...(filters.adAccountId ? { adAccountId: filters.adAccountId } : {}),
        ...(filters.objective ? { objective: filters.objective } : {}),
        ...(filters.campaignIds?.length ? { id: { in: filters.campaignIds } } : {}),
      },
      select: { id: true },
    });
    return campaigns.map((c) => c.id);
  }

  private where(
    filters: MetricFilters,
    range: DateRange,
    table: TableKey,
    campaignIds: string[] | null,
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`m."organizationId" = ${filters.organizationId}`,
      Prisma.sql`m."date" BETWEEN ${range.from}::date AND ${range.to}::date`,
    ];
    if (filters.adAccountId) parts.push(Prisma.sql`m."adAccountId" = ${filters.adAccountId}`);
    if (table !== 'account' && campaignIds !== null) {
      parts.push(
        campaignIds.length > 0
          ? Prisma.sql`m."campaignId" IN (${Prisma.join(campaignIds)})`
          : Prisma.sql`FALSE`,
      );
    }
    if ((table === 'device' || table === 'location') && filters.device) {
      parts.push(Prisma.sql`m."device" = ${filters.device}::"Device"`);
    }
    if (table === 'location' && filters.locationId)
      parts.push(Prisma.sql`m."locationId" = ${filters.locationId}`);
    return Prisma.join(parts, ' AND ');
  }

  private tableSql(table: TableKey): Prisma.Sql {
    return Prisma.raw(`"${TABLES[table]}"`);
  }

  async totals(filters: MetricFilters, range: DateRange, campaignIds?: string[] | null): Promise<TotalsRow> {
    const ids = campaignIds === undefined ? await this.resolveCampaignIds(filters) : campaignIds;
    const table = this.sourceFor(filters);
    const where = this.where(filters, range, table, ids);
    const rows = await this.db.$queryRaw<
      TotalsRow[]
    >`SELECT ${SUMS} FROM ${this.tableSql(table)} m WHERE ${where}`;
    return rows[0] ?? ZERO;
  }

  /** Daily totals for every day in range (zero-filled). */
  async daily(
    filters: MetricFilters,
    range: DateRange,
    campaignIds?: string[] | null,
  ): Promise<{ date: string; totals: TotalsRow }[]> {
    const ids = campaignIds === undefined ? await this.resolveCampaignIds(filters) : campaignIds;
    const table = this.sourceFor(filters);
    const where = this.where(filters, range, table, ids);
    const rows = await this.db.$queryRaw<(TotalsRow & { key: string })[]>`
      SELECT to_char(m."date", 'YYYY-MM-DD') AS "key", ${SUMS}
      FROM ${this.tableSql(table)} m WHERE ${where}
      GROUP BY m."date" ORDER BY m."date"`;
    const byDate = new Map(rows.map((r) => [r.key, r]));
    return eachDay(range).map((date) => ({ date, totals: byDate.get(date) ?? ZERO }));
  }

  /**
   * Totals grouped by a dimension. Device/location filters apply only to dimensions whose tables carry
   * those segments (campaign, device, location); other breakdowns ignore them.
   */
  async groupBy(
    filters: MetricFilters,
    range: DateRange,
    dimension: Exclude<Dimension, 'date' | 'adAccount'>,
    options: { extraWhere?: Prisma.Sql; campaignIds?: string[] | null } = {},
  ): Promise<(TotalsRow & { key: string })[]> {
    const ids =
      options.campaignIds === undefined ? await this.resolveCampaignIds(filters) : options.campaignIds;
    const spec = DIMENSION_TABLE[dimension];
    let table: TableKey = spec.table;
    if (dimension === 'campaign') {
      const source = this.sourceFor(filters);
      table = source === 'account' ? 'campaign' : source;
    }
    const column = Prisma.raw(`m."${spec.column}"`);
    let where = this.where(filters, range, table, ids);
    if (options.extraWhere) where = Prisma.sql`${where} AND ${options.extraWhere}`;
    return this.db.$queryRaw<(TotalsRow & { key: string })[]>`
      SELECT ${column}::text AS "key", ${SUMS}
      FROM ${this.tableSql(table)} m WHERE ${where}
      GROUP BY ${column}`;
  }

  /** Totals per (campaign, segment) pair, e.g. device performance inside each campaign. */
  async groupByCampaignSegment(
    filters: MetricFilters,
    range: DateRange,
    segment: 'device' | 'location' | 'landingPage' | 'searchTerm' | 'keyword',
    campaignIds?: string[] | null,
  ): Promise<(TotalsRow & { campaignId: string; key: string })[]> {
    const ids = campaignIds === undefined ? await this.resolveCampaignIds(filters) : campaignIds;
    const spec = DIMENSION_TABLE[segment];
    const column = Prisma.raw(`m."${spec.column}"`);
    const where = this.where(filters, range, spec.table, ids);
    return this.db.$queryRaw<(TotalsRow & { campaignId: string; key: string })[]>`
      SELECT m."campaignId" AS "campaignId", ${column}::text AS "key", ${SUMS}
      FROM ${this.tableSql(spec.table)} m WHERE ${where}
      GROUP BY m."campaignId", ${column}`;
  }

  async byAccount(filters: MetricFilters, range: DateRange): Promise<(TotalsRow & { key: string })[]> {
    const where = this.where(filters, range, 'account', null);
    return this.db.$queryRaw<(TotalsRow & { key: string })[]>`
      SELECT m."adAccountId" AS "key", ${SUMS}
      FROM "AccountDailyMetric" m WHERE ${where} GROUP BY m."adAccountId"`;
  }

  async landingPageAnalytics(
    filters: MetricFilters,
    range: DateRange,
    campaignIds?: string[] | null,
  ): Promise<
    (TotalsRow & {
      key: string;
      sessions: string | null;
      engagedSessions: string | null;
      keyEvents: string | null;
      joined: boolean;
    })[]
  > {
    const ids = campaignIds === undefined ? await this.resolveCampaignIds(filters) : campaignIds;
    const where = this.where(filters, range, 'landingPage', ids);
    return this.db.$queryRaw`
      SELECT m."landingPageId" AS "key", ${SUMS},
        SUM(m."sessions")::text AS "sessions",
        SUM(m."engagedSessions")::text AS "engagedSessions",
        SUM(m."keyEvents")::text AS "keyEvents",
        BOOL_OR(m."analyticsJoined") AS "joined"
      FROM "LandingPageDailyMetric" m WHERE ${where}
      GROUP BY m."landingPageId"`;
  }

  /** Impression-weighted impression-share metrics per campaign. */
  async impressionShare(
    organizationId: string,
    range: DateRange,
    campaignIds?: string[],
  ): Promise<
    {
      key: string;
      searchImpressionShare: string | null;
      searchTopImpressionShare: string | null;
      searchAbsoluteTopImpressionShare: string | null;
      searchBudgetLostImpressionShare: string | null;
    }[]
  > {
    const campaignFilter = campaignIds?.length
      ? Prisma.sql`AND m."campaignId" IN (${Prisma.join(campaignIds)})`
      : Prisma.empty;
    const weighted = (col: string) =>
      Prisma.raw(
        `(SUM(m."${col}" * m."impressions") FILTER (WHERE m."${col}" IS NOT NULL) / NULLIF(SUM(m."impressions") FILTER (WHERE m."${col}" IS NOT NULL), 0))::text AS "${col}"`,
      );
    return this.db.$queryRaw`
      SELECT m."campaignId" AS "key",
        ${weighted('searchImpressionShare')},
        ${weighted('searchTopImpressionShare')},
        ${weighted('searchAbsoluteTopImpressionShare')},
        ${weighted('searchBudgetLostImpressionShare')}
      FROM "CampaignDailyMetric" m
      WHERE m."organizationId" = ${organizationId}
        AND m."date" BETWEEN ${range.from}::date AND ${range.to}::date ${campaignFilter}
      GROUP BY m."campaignId"`;
  }

  async lastMetricDate(organizationId: string, adAccountId?: string): Promise<string | null> {
    const rows = await this.db.$queryRaw<{ max: string | null }[]>`
      SELECT to_char(MAX(m."date"), 'YYYY-MM-DD') AS "max" FROM "CampaignDailyMetric" m
      WHERE m."organizationId" = ${organizationId}
      ${adAccountId ? Prisma.sql`AND m."adAccountId" = ${adAccountId}` : Prisma.empty}`;
    return rows[0]?.max ?? null;
  }
}
