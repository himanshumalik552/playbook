import type {
  CampaignRowDto,
  DailyPoint,
  DashboardOverviewDto,
  DashboardSummaryDto,
  FilterOptionsDto,
  KpiValues,
} from '@adpulse/types';

export function kpis(overrides: Partial<KpiValues> = {}): KpiValues {
  return {
    impressions: 120_000,
    clicks: 4_800,
    cost: 9_600,
    conversions: 240,
    conversionValue: 38_400,
    ctr: 4,
    cpc: 2,
    cpm: 80,
    conversionRate: 5,
    cpa: 40,
    roas: 4,
    ...overrides,
  };
}

export function trend(days = 3, values: Partial<KpiValues> = {}): DailyPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: `2026-09-${String(25 + i).padStart(2, '0')}`,
    ...kpis(values),
  }));
}

export function overview(overrides: Partial<DashboardOverviewDto> = {}): DashboardOverviewDto {
  return {
    range: { from: '2026-08-29', to: '2026-09-27' },
    previousRange: { from: '2026-07-30', to: '2026-08-28' },
    currencyCode: 'USD',
    timezone: 'UTC',
    kpis: {
      current: kpis(),
      previous: kpis({ cost: 8_000, cpa: 50 }),
      change: {
        cost: { absolute: 1600, percent: 20, isImprovement: null },
        cpa: { absolute: -10, percent: -20, isImprovement: true },
      },
    },
    trend: trend(),
    previousTrend: trend(),
    dataFreshness: {
      lastMetricDate: '2026-09-27',
      lastSuccessfulSyncAt: '2026-09-28T06:00:00.000Z',
      isStale: false,
    },
    source: 'campaign',
    ...overrides,
  };
}

export const EMPTY_SUMMARY: DashboardSummaryDto = {
  alerts: { open: 0, critical: 0, warning: 0, info: 0, latest: [] },
  recommendations: { open: 0, latest: [] },
  recentActions: [],
  sync: null,
};

export const FILTER_OPTIONS: FilterOptionsDto = {
  adAccounts: [{ value: 'acc_1', label: 'Northwind US' }],
  campaigns: [
    { value: 'cmp_1', label: 'Brand Search', adAccountId: 'acc_1', objective: 'SEARCH' },
    { value: 'cmp_2', label: 'Tents Shopping', adAccountId: 'acc_1', objective: 'ECOMMERCE' },
  ],
  devices: [
    { value: 'MOBILE', label: 'Mobile' },
    { value: 'DESKTOP', label: 'Desktop' },
  ],
  locations: [{ value: 'loc_1', label: 'California' }],
  objectives: [{ value: 'SEARCH', label: 'Search' }],
};

export function campaignRow(overrides: Partial<CampaignRowDto> = {}): CampaignRowDto {
  return {
    id: 'cmp_1',
    externalId: '1001',
    name: 'Brand Search',
    adAccountId: 'acc_1',
    adAccountName: 'Northwind US',
    status: 'ENABLED',
    objective: 'SEARCH',
    channelType: 'SEARCH',
    dailyBudget: 300,
    currencyCode: 'USD',
    current: kpis(),
    previous: kpis({ cost: 8_000 }),
    openAlerts: 1,
    ...overrides,
  };
}

/** Implementation for a mocked `api.get`/`api.page` that answers by URL; `Error` values reject. */
/** Resolves mocked API calls by URL; typed `never` so it satisfies any generic `api` method signature. */
export function byUrl(routes: Record<string, unknown>) {
  return (url: string): Promise<never> => {
    if (!(url in routes)) return Promise.reject(new Error(`Unexpected request: ${url}`));
    const value = routes[url];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value as never);
  };
}

export const page = <T>(items: T[]) => ({
  items,
  meta: { page: 1, pageSize: 25, total: items.length, totalPages: 1 },
});
