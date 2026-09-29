import type { DateRange } from '@adpulse/types';

/*
 * Provider DTOs mirror the external APIs (micros, provider enums, string ids) and are deliberately
 * separate from internal domain models; the sync service is the only place that maps between them.
 */

export interface ProviderCredentials {
  refreshToken: string | null;
  loginCustomerId: string | null;
}

export interface AdsAccountContext extends ProviderCredentials {
  customerId: string;
}

export interface ProviderCustomer {
  customerId: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  manager: boolean;
  managerCustomerId: string | null;
}

export type ProviderStatus = 'ENABLED' | 'PAUSED' | 'REMOVED' | 'UNKNOWN';

export interface ProviderCampaign {
  campaignId: string;
  name: string;
  status: ProviderStatus;
  channelType: string;
  budgetMicros: string | null;
  startDate: string | null;
  /** Objective when the provider knows it (mock catalog); otherwise inferred during mapping. */
  objectiveHint?: string;
}

export interface ProviderAdGroup {
  adGroupId: string;
  campaignId: string;
  name: string;
  status: ProviderStatus;
}

export interface ProviderKeyword {
  criterionId: string;
  adGroupId: string;
  campaignId: string;
  text: string;
  matchType: string;
  status: ProviderStatus;
  qualityScore: number | null;
}

export interface ProviderEntities {
  campaigns: ProviderCampaign[];
  adGroups: ProviderAdGroup[];
  keywords: ProviderKeyword[];
}

export interface ProviderMetrics {
  date: string;
  impressions: number;
  clicks: number;
  costMicros: string;
  conversions: number;
  conversionsValue: number;
}

export interface CampaignMetricRow extends ProviderMetrics {
  campaignId: string;
  searchImpressionShare: number | null;
  searchTopImpressionShare: number | null;
  searchAbsoluteTopImpressionShare: number | null;
  searchBudgetLostImpressionShare: number | null;
}

export interface AdGroupMetricRow extends ProviderMetrics {
  campaignId: string;
  adGroupId: string;
}

export interface KeywordMetricRow extends ProviderMetrics {
  campaignId: string;
  adGroupId: string;
  criterionId: string;
  qualityScore: number | null;
}

export interface SearchTermMetricRow extends ProviderMetrics {
  campaignId: string;
  adGroupId: string;
  criterionId: string | null;
  searchTerm: string;
}

export interface DeviceMetricRow extends ProviderMetrics {
  campaignId: string;
  device: string;
}

export interface GeoMetricRow extends ProviderMetrics {
  campaignId: string;
  locationId: string;
  locationName: string;
  countryCode: string;
  device: string;
}

export interface LandingPageMetricRow extends ProviderMetrics {
  campaignId: string;
  url: string;
}

export interface ReportRowMap {
  campaign: CampaignMetricRow;
  ad_group: AdGroupMetricRow;
  keyword: KeywordMetricRow;
  search_term: SearchTermMetricRow;
  device: DeviceMetricRow;
  geo: GeoMetricRow;
  landing_page: LandingPageMetricRow;
}

export type ReportType = keyof ReportRowMap;

export const REPORT_TYPES: ReportType[] = [
  'campaign',
  'ad_group',
  'keyword',
  'search_term',
  'device',
  'geo',
  'landing_page',
];

export interface AdsProvider {
  readonly kind: 'mock' | 'google';
  listAccessibleCustomers(credentials: ProviderCredentials): Promise<ProviderCustomer[]>;
  fetchEntities(context: AdsAccountContext): Promise<ProviderEntities>;
  /** Yields pages of rows so large accounts never need to be held in memory at once. */
  streamReport<R extends ReportType>(
    context: AdsAccountContext,
    report: R,
    range: DateRange,
  ): AsyncIterable<ReportRowMap[R][]>;
}

export interface AnalyticsPropertySummary {
  propertyId: string;
  displayName: string;
  timeZone: string;
}

export interface AnalyticsLandingPageRow {
  date: string;
  landingPage: string;
  googleAdsCampaignId: string | null;
  sessions: number;
  engagedSessions: number;
  keyEvents: number;
}

export interface AnalyticsContext {
  propertyId: string;
  refreshToken: string | null;
}

export interface AnalyticsProvider {
  readonly kind: 'mock' | 'google';
  listProperties(credentials: ProviderCredentials): Promise<AnalyticsPropertySummary[]>;
  streamLandingPages(context: AnalyticsContext, range: DateRange): AsyncIterable<AnalyticsLandingPageRow[]>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
  idToken: string | null;
}

export interface OAuthIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
}
