import type { DateRange } from '@adpulse/types';
import { ProviderError } from '../errors';
import type { GoogleOAuthClient } from './google-oauth';
import { RateLimiter, requestJson } from './http';
import type {
  AnalyticsContext,
  AnalyticsLandingPageRow,
  AnalyticsPropertySummary,
  AnalyticsProvider,
  ProviderCredentials,
} from './types';

interface RunReportResponse {
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  rowCount?: number;
}

interface AccountSummariesResponse {
  accountSummaries?: { propertySummaries?: { property: string; displayName: string }[] }[];
  nextPageToken?: string;
}

const PAGE_LIMIT = 10_000;

/** GA4 dates are YYYYMMDD. */
const toIsoDate = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;

export class GoogleAnalyticsProvider implements AnalyticsProvider {
  readonly kind = 'google' as const;
  private readonly limiter = new RateLimiter(250);

  constructor(private readonly oauth: GoogleOAuthClient) {}

  private async authHeader(refreshToken: string | null) {
    if (!refreshToken) throw new ProviderError('GA4 connection has no refresh token', 'AUTH', false, 401);
    return { Authorization: `Bearer ${await this.oauth.getAccessToken(refreshToken)}` };
  }

  async listProperties(credentials: ProviderCredentials): Promise<AnalyticsPropertySummary[]> {
    const headers = await this.authHeader(credentials.refreshToken);
    const properties: AnalyticsPropertySummary[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
      url.searchParams.set('pageSize', '200');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const res = await requestJson<AccountSummariesResponse>(
        { url: url.toString(), headers },
        { limiter: this.limiter },
      );
      for (const account of res.accountSummaries ?? []) {
        for (const p of account.propertySummaries ?? []) {
          const id = p.property.replace('properties/', '');
          const detail = await requestJson<{ timeZone?: string }>(
            { url: `https://analyticsadmin.googleapis.com/v1beta/properties/${id}`, headers },
            { limiter: this.limiter },
          );
          properties.push({ propertyId: id, displayName: p.displayName, timeZone: detail.timeZone ?? 'UTC' });
        }
      }
      pageToken = res.nextPageToken;
    } while (pageToken);
    return properties;
  }

  /**
   * Landing-page sessions joined to Google Ads campaigns via `sessionGoogleAdsCampaignId`. Rows where
   * GA4 cannot attribute a campaign return null so the sync marks them as not reliably joinable.
   */
  async *streamLandingPages(
    context: AnalyticsContext,
    range: DateRange,
  ): AsyncIterable<AnalyticsLandingPageRow[]> {
    const headers = await this.authHeader(context.refreshToken);
    let offset = 0;
    for (;;) {
      const res = await requestJson<RunReportResponse>(
        {
          url: `https://analyticsdata.googleapis.com/v1beta/properties/${context.propertyId}:runReport`,
          headers,
          body: {
            dateRanges: [{ startDate: range.from, endDate: range.to }],
            dimensions: [{ name: 'date' }, { name: 'landingPage' }, { name: 'sessionGoogleAdsCampaignId' }],
            metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
            limit: PAGE_LIMIT,
            offset,
          },
        },
        { limiter: this.limiter },
      );
      const rows = (res.rows ?? []).map((r) => {
        const campaign = r.dimensionValues[2]?.value ?? '';
        return {
          date: toIsoDate(r.dimensionValues[0]?.value ?? ''),
          landingPage: r.dimensionValues[1]?.value ?? '',
          googleAdsCampaignId: /^\d+$/.test(campaign) ? campaign : null,
          sessions: Number(r.metricValues[0]?.value ?? 0),
          engagedSessions: Number(r.metricValues[1]?.value ?? 0),
          keyEvents: Number(r.metricValues[2]?.value ?? 0),
        };
      });
      if (rows.length > 0) yield rows;
      offset += PAGE_LIMIT;
      if (rows.length < PAGE_LIMIT || offset >= (res.rowCount ?? 0)) break;
    }
  }
}
