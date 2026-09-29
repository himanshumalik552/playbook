import type { DateRange } from '@adpulse/types';
import { ProviderError } from '../errors';
import type { GoogleOAuthClient } from './google-oauth';
import { RateLimiter, requestJson } from './http';
import type {
  AdsAccountContext,
  AdsProvider,
  ProviderCredentials,
  ProviderCustomer,
  ProviderEntities,
  ProviderMetrics,
  ProviderStatus,
  ReportRowMap,
  ReportType,
} from './types';

type GaqlRow = Record<string, Record<string, unknown> | undefined>;

interface SearchResponse {
  results?: GaqlRow[];
  nextPageToken?: string;
}

const METRIC_FIELDS =
  'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value';

const between = (range: DateRange) => `segments.date BETWEEN '${range.from}' AND '${range.to}'`;

const REPORT_QUERIES: Record<ReportType, (range: DateRange) => string> = {
  campaign: (r) =>
    `SELECT campaign.id, segments.date, ${METRIC_FIELDS}, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share, metrics.search_budget_lost_impression_share FROM campaign WHERE ${between(r)}`,
  ad_group: (r) =>
    `SELECT campaign.id, ad_group.id, segments.date, ${METRIC_FIELDS} FROM ad_group WHERE ${between(r)}`,
  keyword: (r) =>
    `SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.quality_info.quality_score, segments.date, ${METRIC_FIELDS} FROM keyword_view WHERE ${between(r)}`,
  search_term: (r) =>
    `SELECT campaign.id, ad_group.id, search_term_view.search_term, segments.keyword.ad_group_criterion, segments.date, ${METRIC_FIELDS} FROM search_term_view WHERE ${between(r)}`,
  device: (r) =>
    `SELECT campaign.id, segments.device, segments.date, ${METRIC_FIELDS} FROM campaign WHERE ${between(r)}`,
  geo: (r) =>
    `SELECT campaign.id, segments.geo_target_region, geographic_view.country_criterion_id, segments.device, segments.date, ${METRIC_FIELDS} FROM geographic_view WHERE ${between(r)}`,
  landing_page: (r) =>
    `SELECT campaign.id, landing_page_view.unexpanded_final_url, segments.date, ${METRIC_FIELDS} FROM landing_page_view WHERE ${between(r)}`,
};

const str = (value: unknown): string => (value === undefined || value === null ? '' : String(value));
const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const share = (value: unknown): number | null => (value === undefined || value === null ? null : num(value));
const lastSegment = (resource: string, sep = '/') => resource.split(sep).pop() ?? resource;

function status(value: unknown): ProviderStatus {
  const s = str(value);
  return s === 'ENABLED' || s === 'PAUSED' || s === 'REMOVED' ? s : 'UNKNOWN';
}

function metrics(row: GaqlRow): ProviderMetrics {
  const m = row.metrics ?? {};
  return {
    date: str(row.segments?.date),
    impressions: num(m.impressions),
    clicks: num(m.clicks),
    costMicros: str(m.costMicros || '0'),
    conversions: num(m.conversions),
    conversionsValue: num(m.conversionsValue),
  };
}

/**
 * Read-only Google Ads API client using the REST interface and GAQL. Only `search` endpoints are used;
 * no mutate operations exist in this class by design.
 */
export class GoogleAdsProvider implements AdsProvider {
  readonly kind = 'google' as const;
  private readonly limiter = new RateLimiter(120);
  private readonly geoNames = new Map<string, { name: string; countryCode: string }>();

  constructor(
    private readonly oauth: GoogleOAuthClient,
    private readonly developerToken: string,
    private readonly apiVersion: string,
    private readonly defaultLoginCustomerId?: string,
  ) {}

  private get baseUrl() {
    return `https://googleads.googleapis.com/${this.apiVersion}`;
  }

  private async headers(credentials: ProviderCredentials, loginCustomerId?: string | null) {
    if (!credentials.refreshToken)
      throw new ProviderError('Google Ads connection has no refresh token', 'AUTH', false, 401);
    const accessToken = await this.oauth.getAccessToken(credentials.refreshToken);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': this.developerToken,
    };
    const login = (loginCustomerId ?? credentials.loginCustomerId ?? this.defaultLoginCustomerId)?.replace(
      /-/g,
      '',
    );
    if (login) headers['login-customer-id'] = login;
    return headers;
  }

  /** Paginates GAQL `search` results page by page. */
  async *search(
    context: AdsAccountContext,
    query: string,
    loginCustomerId?: string | null,
  ): AsyncIterable<GaqlRow[]> {
    let pageToken: string | undefined;
    do {
      const response = await requestJson<SearchResponse>(
        {
          url: `${this.baseUrl}/customers/${context.customerId}/googleAds:search`,
          headers: await this.headers(context, loginCustomerId),
          body: { query, ...(pageToken ? { pageToken } : {}) },
          timeoutMs: 120_000,
        },
        { limiter: this.limiter },
      );
      if (response.results?.length) yield response.results;
      pageToken = response.nextPageToken;
    } while (pageToken);
  }

  private async collect(context: AdsAccountContext, query: string, loginCustomerId?: string | null) {
    const rows: GaqlRow[] = [];
    for await (const page of this.search(context, query, loginCustomerId)) rows.push(...page);
    return rows;
  }

  async listAccessibleCustomers(credentials: ProviderCredentials): Promise<ProviderCustomer[]> {
    const res = await requestJson<{ resourceNames?: string[] }>(
      {
        url: `${this.baseUrl}/customers:listAccessibleCustomers`,
        headers: await this.headers(credentials, null),
      },
      { limiter: this.limiter },
    );
    const customers = new Map<string, ProviderCustomer>();
    for (const resource of res.resourceNames ?? []) {
      const id = lastSegment(resource);
      const ctx = { ...credentials, customerId: id };
      try {
        const rows = await this.collect(
          ctx,
          'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level <= 1',
          id,
        );
        for (const row of rows) {
          const c = row.customerClient ?? {};
          const clientId = str(c.id);
          const level = num(c.level);
          customers.set(clientId, {
            customerId: clientId,
            descriptiveName: str(c.descriptiveName) || clientId,
            currencyCode: str(c.currencyCode) || 'USD',
            timeZone: str(c.timeZone) || 'UTC',
            manager: c.manager === true,
            managerCustomerId: level === 0 ? (customers.get(clientId)?.managerCustomerId ?? null) : id,
          });
        }
      } catch (error) {
        if (error instanceof ProviderError && error.code === 'PERMISSION') continue;
        throw error;
      }
    }
    return [...customers.values()];
  }

  async fetchEntities(context: AdsAccountContext): Promise<ProviderEntities> {
    const [campaigns, adGroups, keywords] = await Promise.all([
      this.collect(
        context,
        "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'",
      ),
      this.collect(
        context,
        "SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE ad_group.status != 'REMOVED'",
      ),
      this.collect(
        context,
        "SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score FROM keyword_view WHERE ad_group_criterion.status != 'REMOVED'",
      ),
    ]);
    return {
      campaigns: campaigns.map((r) => ({
        campaignId: str(r.campaign?.id),
        name: str(r.campaign?.name),
        status: status(r.campaign?.status),
        channelType: str(r.campaign?.advertisingChannelType),
        budgetMicros: r.campaignBudget?.amountMicros ? str(r.campaignBudget.amountMicros) : null,
        startDate: null,
      })),
      adGroups: adGroups.map((r) => ({
        adGroupId: str(r.adGroup?.id),
        campaignId: str(r.campaign?.id),
        name: str(r.adGroup?.name),
        status: status(r.adGroup?.status),
      })),
      keywords: keywords.map((r) => {
        const criterion = r.adGroupCriterion ?? {};
        const keyword = (criterion.keyword ?? {}) as Record<string, unknown>;
        const quality = (criterion.qualityInfo ?? {}) as Record<string, unknown>;
        return {
          criterionId: str(criterion.criterionId),
          adGroupId: str(r.adGroup?.id),
          campaignId: str(r.campaign?.id),
          text: str(keyword.text),
          matchType: str(keyword.matchType),
          status: status(criterion.status),
          qualityScore: quality.qualityScore === undefined ? null : num(quality.qualityScore),
        };
      }),
    };
  }

  private async resolveGeoNames(context: AdsAccountContext, ids: string[]): Promise<void> {
    const missing = [...new Set(ids)].filter((id) => id && !this.geoNames.has(id));
    for (let i = 0; i < missing.length; i += 500) {
      const chunk = missing.slice(i, i + 500);
      const rows = await this.collect(
        context,
        `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.country_code FROM geo_target_constant WHERE geo_target_constant.id IN (${chunk.join(',')})`,
      );
      for (const row of rows) {
        const g = row.geoTargetConstant ?? {};
        this.geoNames.set(str(g.id), { name: str(g.name), countryCode: str(g.countryCode) || 'ZZ' });
      }
    }
  }

  async *streamReport<R extends ReportType>(
    context: AdsAccountContext,
    report: R,
    range: DateRange,
  ): AsyncIterable<ReportRowMap[R][]> {
    for await (const page of this.search(context, REPORT_QUERIES[report](range))) {
      if (report === 'geo') {
        await this.resolveGeoNames(
          context,
          page.map((r) => lastSegment(str(r.segments?.geoTargetRegion))),
        );
      }
      yield page.map((row) => this.mapRow(report, row)) as ReportRowMap[R][];
    }
  }

  private mapRow(report: ReportType, row: GaqlRow): ReportRowMap[ReportType] {
    const base = { campaignId: str(row.campaign?.id), ...metrics(row) };
    switch (report) {
      case 'campaign':
        return {
          ...base,
          searchImpressionShare: share(row.metrics?.searchImpressionShare),
          searchTopImpressionShare: share(row.metrics?.searchTopImpressionShare),
          searchAbsoluteTopImpressionShare: share(row.metrics?.searchAbsoluteTopImpressionShare),
          searchBudgetLostImpressionShare: share(row.metrics?.searchBudgetLostImpressionShare),
        };
      case 'ad_group':
        return { ...base, adGroupId: str(row.adGroup?.id) };
      case 'keyword': {
        const quality = (row.adGroupCriterion?.qualityInfo ?? {}) as Record<string, unknown>;
        return {
          ...base,
          adGroupId: str(row.adGroup?.id),
          criterionId: str(row.adGroupCriterion?.criterionId),
          qualityScore: quality.qualityScore === undefined ? null : num(quality.qualityScore),
        };
      }
      case 'search_term': {
        const keywordSegment = (row.segments?.keyword ?? {}) as Record<string, unknown>;
        const criterion = str(keywordSegment.adGroupCriterion);
        return {
          ...base,
          adGroupId: str(row.adGroup?.id),
          criterionId: criterion ? lastSegment(criterion, '~') : null,
          searchTerm: str(row.searchTermView?.searchTerm),
        };
      }
      case 'device':
        return { ...base, device: str(row.segments?.device) };
      case 'geo': {
        const id = lastSegment(str(row.segments?.geoTargetRegion));
        const geo = this.geoNames.get(id);
        return {
          ...base,
          locationId: id || str(row.geographicView?.countryCriterionId),
          locationName: geo?.name ?? `Location ${id}`,
          countryCode: geo?.countryCode ?? 'ZZ',
          device: str(row.segments?.device),
        };
      }
      case 'landing_page':
        return { ...base, url: str(row.landingPageView?.unexpandedFinalUrl) };
    }
  }
}
