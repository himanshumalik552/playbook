import { generateAccountRange, MOCK_ACCOUNTS } from '@adpulse/mock-data';
import type { DateRange } from '@adpulse/types';
import { mockAnchorDate } from './mock-ads.provider';
import type {
  AnalyticsContext,
  AnalyticsLandingPageRow,
  AnalyticsPropertySummary,
  AnalyticsProvider,
} from './types';

/** Demo GA4 property ids map 1:1 to demo Ads customers: "ga4-<customerId>". */
export const mockPropertyId = (customerId: string) => `ga4-${customerId}`;

export class MockAnalyticsProvider implements AnalyticsProvider {
  readonly kind = 'mock' as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listProperties(): Promise<AnalyticsPropertySummary[]> {
    return MOCK_ACCOUNTS.map((a) => ({
      propertyId: mockPropertyId(a.customerId),
      displayName: `${a.name} (GA4)`,
      timeZone: a.timezone,
    }));
  }

  async *streamLandingPages(
    context: AnalyticsContext,
    range: DateRange,
  ): AsyncIterable<AnalyticsLandingPageRow[]> {
    const account = MOCK_ACCOUNTS.find((a) => mockPropertyId(a.customerId) === context.propertyId);
    if (!account) return;
    const anchor = mockAnchorDate(account, this.now());
    let page: AnalyticsLandingPageRow[] = [];
    for (const day of generateAccountRange(
      account,
      range.from,
      range.to > anchor ? anchor : range.to,
      anchor,
    )) {
      for (const p of day.landingPages) {
        page.push({
          date: day.date,
          landingPage: new URL(p.url).pathname,
          googleAdsCampaignId: day.campaignId,
          sessions: p.sessions,
          engagedSessions: p.engagedSessions,
          keyEvents: p.keyEvents,
        });
      }
      if (page.length >= 5000) {
        yield page;
        page = [];
      }
    }
    if (page.length > 0) yield page;
  }
}
