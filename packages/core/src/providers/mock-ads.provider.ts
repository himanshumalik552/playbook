import { addDays, isoDateInTimezone } from '@adpulse/kpi';
import {
  generateAccountRange,
  type GeneratedCampaignDay,
  MOCK_ACCOUNTS,
  type MetricCell,
  MOCK_MANAGER_ACCOUNT,
  type MockAccountDef,
} from '@adpulse/mock-data';
import type { DateRange } from '@adpulse/types';
import { ProviderError } from '../errors';
import type {
  AdsAccountContext,
  AdsProvider,
  ProviderCustomer,
  ProviderEntities,
  ProviderMetrics,
  ReportRowMap,
  ReportType,
} from './types';

const PAGE_SIZE = 5000;

const micros = (value: number) => Math.round(value * 1_000_000).toString();

function metrics(date: string, cell: MetricCell): ProviderMetrics {
  return {
    date,
    impressions: cell.impressions,
    clicks: cell.clicks,
    costMicros: micros(cell.cost),
    conversions: cell.conversions,
    conversionsValue: cell.conversionValue,
  };
}

/** Anchor for demo data: yesterday in the account timezone, overridable for deterministic tests. */
export function mockAnchorDate(account: MockAccountDef, now = new Date()): string {
  return process.env.MOCK_ANCHOR_DATE ?? addDays(isoDateInTimezone(now, account.timezone), -1);
}

/**
 * Demo-mode provider backed by the deterministic generator in @adpulse/mock-data. It exposes exactly the
 * same contract as the Google Ads provider so the sync pipeline is identical in both modes.
 */
export class MockAdsProvider implements AdsProvider {
  readonly kind = 'mock' as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  private account(customerId: string): MockAccountDef {
    const account = MOCK_ACCOUNTS.find((a) => a.customerId === customerId);
    if (!account) throw new ProviderError(`Unknown demo customer ${customerId}`, 'NOT_FOUND', false, 404);
    return account;
  }

  async listAccessibleCustomers(): Promise<ProviderCustomer[]> {
    return [
      {
        customerId: MOCK_MANAGER_ACCOUNT.customerId,
        descriptiveName: MOCK_MANAGER_ACCOUNT.name,
        currencyCode: 'USD',
        timeZone: 'America/New_York',
        manager: true,
        managerCustomerId: null,
      },
      ...MOCK_ACCOUNTS.map((a) => ({
        customerId: a.customerId,
        descriptiveName: a.name,
        currencyCode: a.currencyCode,
        timeZone: a.timezone,
        manager: false,
        managerCustomerId: a.managerCustomerId,
      })),
    ];
  }

  async fetchEntities(context: AdsAccountContext): Promise<ProviderEntities> {
    const account = this.account(context.customerId);
    const anchor = mockAnchorDate(account, this.now());
    const entities: ProviderEntities = { campaigns: [], adGroups: [], keywords: [] };
    for (const c of account.campaigns) {
      entities.campaigns.push({
        campaignId: c.id,
        name: c.name,
        status: c.status,
        channelType: c.channelType,
        budgetMicros: micros(c.dailyBudget),
        startDate: addDays(anchor, -400),
        objectiveHint: c.objective,
      });
      for (const g of c.adGroups) {
        entities.adGroups.push({ adGroupId: g.id, campaignId: c.id, name: g.name, status: 'ENABLED' });
        for (const k of g.keywords) {
          entities.keywords.push({
            criterionId: k.id,
            adGroupId: g.id,
            campaignId: c.id,
            text: k.text,
            matchType: k.matchType,
            status: 'ENABLED',
            qualityScore: k.qualityScore,
          });
        }
      }
    }
    return entities;
  }

  async *streamReport<R extends ReportType>(
    context: AdsAccountContext,
    report: R,
    range: DateRange,
  ): AsyncIterable<ReportRowMap[R][]> {
    const account = this.account(context.customerId);
    const anchor = mockAnchorDate(account, this.now());
    const to = range.to > anchor ? anchor : range.to;
    let page: ReportRowMap[R][] = [];
    for (const day of generateAccountRange(account, range.from, to, anchor)) {
      for (const row of this.rowsFor(report, day)) {
        page.push(row as ReportRowMap[R]);
        if (page.length >= PAGE_SIZE) {
          yield page;
          page = [];
        }
      }
    }
    if (page.length > 0) yield page;
  }

  private rowsFor(report: ReportType, day: GeneratedCampaignDay): ReportRowMap[ReportType][] {
    const base = { campaignId: day.campaignId };
    switch (report) {
      case 'campaign':
        return [
          {
            ...base,
            ...metrics(day.date, day),
            searchImpressionShare: day.searchImpressionShare,
            searchTopImpressionShare: day.searchTopImpressionShare,
            searchAbsoluteTopImpressionShare: day.searchAbsoluteTopImpressionShare,
            searchBudgetLostImpressionShare: day.searchBudgetLostImpressionShare,
          },
        ];
      case 'ad_group':
        return day.adGroups.map((g) => ({ ...base, adGroupId: g.adGroupId, ...metrics(day.date, g) }));
      case 'keyword':
        return day.keywords.map((k) => ({
          ...base,
          adGroupId: k.adGroupId,
          criterionId: k.keywordId,
          qualityScore: k.qualityScore,
          ...metrics(day.date, k),
        }));
      case 'search_term':
        return day.searchTerms.map((t) => ({
          ...base,
          adGroupId: t.adGroupId,
          criterionId: t.keywordId,
          searchTerm: t.term,
          ...metrics(day.date, t),
        }));
      case 'device':
        return day.devices.map((d) => ({ ...base, device: d.device, ...metrics(day.date, d) }));
      case 'geo':
        return day.locations.map((l) => ({
          ...base,
          locationId: l.locationId,
          locationName: l.locationName,
          countryCode: l.countryCode,
          device: l.device,
          ...metrics(day.date, l),
        }));
      case 'landing_page':
        return day.landingPages.map((p) => ({ ...base, url: p.url, ...metrics(day.date, p) }));
    }
  }
}
