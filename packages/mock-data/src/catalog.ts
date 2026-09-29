import type { CampaignObjective, CampaignStatus, ChannelType, Device, MatchType } from '@adpulse/types';

export type PerformancePattern =
  | 'HEALTHY'
  | 'RISING_CPC'
  | 'FALLING_CVR'
  | 'CPA_ABOVE_TARGET'
  | 'STRONG_ROAS_LOW_VOLUME'
  | 'HIGH_IMPRESSIONS_LOW_CTR'
  | 'SPEND_NO_CONVERSIONS'
  | 'IMPRESSIONS_DROP'
  | 'HIGH_BOUNCE';

export interface MockSearchTermDef {
  term: string;
  share: number;
  cvrFactor: number;
  cpcFactor: number;
}

export interface MockKeywordDef {
  id: string;
  text: string;
  matchType: MatchType;
  qualityScore: number;
  weight: number;
  ctrFactor: number;
  terms: MockSearchTermDef[];
}

export interface MockAdGroupDef {
  id: string;
  name: string;
  weight: number;
  keywords: MockKeywordDef[];
}

export interface MockCampaignDef {
  id: string;
  name: string;
  status: CampaignStatus;
  channelType: ChannelType;
  objective: CampaignObjective;
  pattern: PerformancePattern;
  dailyBudget: number;
  impressions: number;
  ctr: number;
  cpc: number;
  cvr: number;
  avgValue: number;
  impressionShare: number | null;
  budgetLostShare: number | null;
  /** Days before the end date since which the campaign has been paused. */
  pausedDaysAgo?: number;
  adGroups: MockAdGroupDef[];
  landingPages: { path: string; weight: number }[];
  deviceCvr: Record<Device, number>;
}

export interface MockAccountDef {
  customerId: string;
  name: string;
  currencyCode: string;
  timezone: string;
  managerCustomerId: string;
  domain: string;
  campaigns: MockCampaignDef[];
}

export const MOCK_MANAGER_ACCOUNT = { customerId: '9000000001', name: 'Northwind Agency MCC' };

export const MOCK_LOCATIONS = [
  { id: '21167', name: 'New York', countryCode: 'US', weight: 0.2, cvr: 1.05 },
  { id: '21137', name: 'California', countryCode: 'US', weight: 0.22, cvr: 1.1 },
  { id: '21176', name: 'Texas', countryCode: 'US', weight: 0.15, cvr: 1.0 },
  { id: '21147', name: 'Illinois', countryCode: 'US', weight: 0.1, cvr: 0.95 },
  { id: '21142', name: 'Florida', countryCode: 'US', weight: 0.12, cvr: 0.55 },
  { id: '21180', name: 'Washington', countryCode: 'US', weight: 0.08, cvr: 1.15 },
  { id: '21138', name: 'Colorado', countryCode: 'US', weight: 0.07, cvr: 1.2 },
  { id: '20121', name: 'Ontario', countryCode: 'CA', weight: 0.06, cvr: 0.7 },
] as const;

export const MOCK_DEVICE_SHARES: Record<Exclude<Device, 'OTHER'>, number> = {
  DESKTOP: 0.4,
  MOBILE: 0.52,
  TABLET: 0.08,
};

const kw = (
  id: string,
  text: string,
  matchType: MatchType,
  qualityScore: number,
  weight: number,
  terms: [string, number, number, number][],
  ctrFactor = 1,
): MockKeywordDef => ({
  id,
  text,
  matchType,
  qualityScore,
  weight,
  ctrFactor,
  terms: terms.map(([term, share, cvrFactor, cpcFactor]) => ({ term, share, cvrFactor, cpcFactor })),
});

const group = (
  id: string,
  name: string,
  weight: number,
  keywords: MockKeywordDef[] = [],
): MockAdGroupDef => ({
  id,
  name,
  weight,
  keywords,
});

const DEVICE_NEUTRAL: Record<Device, number> = { DESKTOP: 1.1, MOBILE: 0.92, TABLET: 1, OTHER: 1 };
const DEVICE_MOBILE_WEAK: Record<Device, number> = { DESKTOP: 1.35, MOBILE: 0.55, TABLET: 1, OTHER: 1 };

export const MOCK_ACCOUNTS: MockAccountDef[] = [
  {
    customerId: '1234567890',
    name: 'Northwind Outdoor — Ecommerce',
    currencyCode: 'USD',
    timezone: 'America/New_York',
    managerCustomerId: MOCK_MANAGER_ACCOUNT.customerId,
    domain: 'https://shop.northwind-outdoor.example',
    campaigns: [
      {
        id: '20001',
        name: 'Brand — Exact',
        status: 'ENABLED',
        channelType: 'SEARCH',
        objective: 'SEARCH',
        pattern: 'HEALTHY',
        dailyBudget: 350,
        impressions: 4200,
        ctr: 0.12,
        cpc: 0.65,
        cvr: 0.09,
        avgValue: 118,
        impressionShare: 0.92,
        budgetLostShare: 0.01,
        adGroups: [
          group('30001', 'Brand core', 0.7, [
            kw('40001', 'northwind outdoor', 'EXACT', 10, 0.6, [
              ['northwind outdoor', 0.7, 1.1, 1],
              ['northwind outdoor store', 0.2, 1, 1],
            ]),
            kw('40002', 'northwind outdoor coupon', 'PHRASE', 8, 0.4, [
              ['northwind outdoor coupon code', 0.6, 0.8, 1],
              ['northwind outdoor discount', 0.3, 0.9, 1],
            ]),
          ]),
          group('30002', 'Brand products', 0.3, [
            kw('40003', 'northwind hiking gear', 'PHRASE', 9, 1, [
              ['northwind hiking gear sale', 0.6, 1.1, 1],
              ['northwind backpacks', 0.3, 1.2, 1],
            ]),
          ]),
        ],
        landingPages: [
          { path: '/', weight: 0.8 },
          { path: '/sale', weight: 0.2 },
        ],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '20002',
        name: 'Generic — Hiking Boots',
        status: 'ENABLED',
        channelType: 'SEARCH',
        objective: 'ECOMMERCE',
        pattern: 'RISING_CPC',
        dailyBudget: 1000,
        impressions: 16000,
        ctr: 0.045,
        cpc: 1.35,
        cvr: 0.032,
        avgValue: 142,
        impressionShare: 0.54,
        budgetLostShare: 0.08,
        adGroups: [
          group('30003', 'Waterproof boots', 0.5, [
            kw('40004', 'waterproof hiking boots', 'PHRASE', 7, 0.55, [
              ['best waterproof hiking boots', 0.35, 1.2, 1],
              ['waterproof hiking boots women', 0.3, 1.1, 1],
              ['cheap waterproof boots', 0.2, 0.3, 0.9],
            ]),
            kw('40005', 'gore tex hiking boots', 'EXACT', 8, 0.45, [
              ['gore tex hiking boots', 0.7, 1.2, 1.1],
              ['gore tex boots repair', 0.2, 0, 0.8],
            ]),
          ]),
          group('30004', 'Trail runners', 0.3, [
            kw('40006', 'trail running shoes', 'BROAD', 5, 1, [
              ['trail running shoes', 0.45, 1, 1],
              ['free running shoes giveaway', 0.2, 0, 1],
              ['trail running tips', 0.15, 0, 0.9],
            ]),
          ]),
          group('30005', 'Kids boots', 0.2, [
            kw('40007', 'kids hiking boots', 'PHRASE', 6, 1, [
              ['kids hiking boots', 0.6, 1.1, 1],
              ['toddler hiking shoes', 0.3, 0.8, 1],
            ]),
          ]),
        ],
        landingPages: [
          { path: '/boots', weight: 0.7 },
          { path: '/boots/waterproof', weight: 0.3 },
        ],
        deviceCvr: DEVICE_MOBILE_WEAK,
      },
      {
        id: '20003',
        name: 'Shopping — All Products',
        status: 'ENABLED',
        channelType: 'SHOPPING',
        objective: 'ECOMMERCE',
        pattern: 'HEALTHY',
        dailyBudget: 500,
        impressions: 52000,
        ctr: 0.011,
        cpc: 0.72,
        cvr: 0.028,
        avgValue: 96,
        impressionShare: null,
        budgetLostShare: null,
        adGroups: [group('30006', 'All products', 0.75), group('30007', 'Best sellers', 0.25)],
        landingPages: [
          { path: '/products', weight: 0.6 },
          { path: '/boots', weight: 0.2 },
          { path: '/tents', weight: 0.2 },
        ],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '20004',
        name: 'Shopping — Premium Tents',
        status: 'ENABLED',
        channelType: 'SHOPPING',
        objective: 'ECOMMERCE',
        pattern: 'STRONG_ROAS_LOW_VOLUME',
        dailyBudget: 45,
        impressions: 2600,
        ctr: 0.016,
        cpc: 1.05,
        cvr: 0.05,
        avgValue: 410,
        impressionShare: 0.31,
        budgetLostShare: 0.52,
        adGroups: [group('30008', 'Premium tents', 1)],
        landingPages: [{ path: '/tents/premium', weight: 1 }],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '20005',
        name: 'Display — Prospecting',
        status: 'ENABLED',
        channelType: 'DISPLAY',
        objective: 'DISPLAY',
        pattern: 'HIGH_IMPRESSIONS_LOW_CTR',
        dailyBudget: 250,
        impressions: 210000,
        ctr: 0.0011,
        cpc: 0.95,
        cvr: 0.006,
        avgValue: 90,
        impressionShare: null,
        budgetLostShare: null,
        adGroups: [
          group('30009', 'Affinity — Outdoor enthusiasts', 0.6),
          group('30010', 'In-market — Camping', 0.4),
        ],
        landingPages: [{ path: '/explore', weight: 1 }],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '20006',
        name: 'Remarketing — Cart Abandoners',
        status: 'ENABLED',
        channelType: 'DISPLAY',
        objective: 'REMARKETING',
        pattern: 'HEALTHY',
        dailyBudget: 150,
        impressions: 24000,
        ctr: 0.0085,
        cpc: 0.55,
        cvr: 0.07,
        avgValue: 125,
        impressionShare: null,
        budgetLostShare: null,
        adGroups: [group('30011', 'Cart 1-7 days', 0.65), group('30012', 'Cart 8-30 days', 0.35)],
        landingPages: [{ path: '/cart', weight: 1 }],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '20007',
        name: 'Remarketing — Past Buyers',
        status: 'ENABLED',
        channelType: 'DISPLAY',
        objective: 'REMARKETING',
        pattern: 'FALLING_CVR',
        dailyBudget: 90,
        impressions: 18000,
        ctr: 0.007,
        cpc: 0.6,
        cvr: 0.06,
        avgValue: 88,
        impressionShare: null,
        budgetLostShare: null,
        adGroups: [group('30013', 'Buyers 30-180 days', 1)],
        landingPages: [{ path: '/new-arrivals', weight: 1 }],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '20008',
        name: 'PMax — Camping Gear',
        status: 'ENABLED',
        channelType: 'PERFORMANCE_MAX',
        objective: 'ECOMMERCE',
        pattern: 'CPA_ABOVE_TARGET',
        dailyBudget: 420,
        impressions: 38000,
        ctr: 0.009,
        cpc: 1.1,
        cvr: 0.011,
        avgValue: 105,
        impressionShare: null,
        budgetLostShare: null,
        adGroups: [group('30014', 'Asset group — Camping', 1)],
        landingPages: [
          { path: '/camping', weight: 0.7 },
          { path: '/tents', weight: 0.3 },
        ],
        deviceCvr: DEVICE_MOBILE_WEAK,
      },
      {
        id: '20009',
        name: 'Seasonal — Winter Sale',
        status: 'PAUSED',
        channelType: 'SEARCH',
        objective: 'ECOMMERCE',
        pattern: 'HEALTHY',
        dailyBudget: 520,
        impressions: 9000,
        ctr: 0.05,
        cpc: 1.1,
        cvr: 0.04,
        avgValue: 160,
        impressionShare: 0.6,
        budgetLostShare: 0.1,
        pausedDaysAgo: 75,
        adGroups: [
          group('30015', 'Winter jackets', 1, [
            kw('40008', 'winter jackets sale', 'PHRASE', 7, 1, [
              ['winter jackets sale', 0.6, 1.1, 1],
              ['down jacket clearance', 0.3, 1, 1],
            ]),
          ]),
        ],
        landingPages: [{ path: '/winter-sale', weight: 1 }],
        deviceCvr: DEVICE_NEUTRAL,
      },
    ],
  },
  {
    customerId: '2345678901',
    name: 'Northwind Home Services — Leads',
    currencyCode: 'USD',
    timezone: 'America/Chicago',
    managerCustomerId: MOCK_MANAGER_ACCOUNT.customerId,
    domain: 'https://services.northwind-home.example',
    campaigns: [
      {
        id: '21001',
        name: 'Services — Installation Leads',
        status: 'ENABLED',
        channelType: 'SEARCH',
        objective: 'LEAD_GENERATION',
        pattern: 'HEALTHY',
        dailyBudget: 1400,
        impressions: 7800,
        ctr: 0.062,
        cpc: 2.8,
        cvr: 0.11,
        avgValue: 140,
        impressionShare: 0.71,
        budgetLostShare: 0.05,
        adGroups: [
          group('31001', 'Heat pump installation', 0.55, [
            kw('41001', 'heat pump installation', 'PHRASE', 8, 0.6, [
              ['heat pump installation near me', 0.5, 1.2, 1],
              ['heat pump installation cost', 0.35, 0.9, 1],
            ]),
            kw('41002', 'heat pump installer', 'EXACT', 9, 0.4, [['heat pump installer', 0.8, 1.2, 1]]),
          ]),
          group('31002', 'Water heater installation', 0.45, [
            kw('41003', 'tankless water heater install', 'PHRASE', 7, 1, [
              ['tankless water heater install', 0.5, 1.1, 1],
              ['tankless water heater diy', 0.25, 0, 0.9],
            ]),
          ]),
        ],
        landingPages: [
          { path: '/installation', weight: 0.7 },
          { path: '/installation/heat-pumps', weight: 0.3 },
        ],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '21002',
        name: 'Services — Emergency Repair',
        status: 'ENABLED',
        channelType: 'SEARCH',
        objective: 'LEAD_GENERATION',
        pattern: 'SPEND_NO_CONVERSIONS',
        dailyBudget: 500,
        impressions: 2400,
        ctr: 0.055,
        cpc: 3.6,
        cvr: 0.05,
        avgValue: 150,
        impressionShare: 0.48,
        budgetLostShare: 0.12,
        adGroups: [
          group('31003', 'Emergency plumbing', 1, [
            kw('41004', 'emergency plumber', 'PHRASE', 6, 0.7, [
              ['24 hour emergency plumber', 0.5, 1, 1.1],
              ['emergency plumber salary', 0.25, 0, 1],
            ]),
            kw('41005', 'burst pipe repair', 'BROAD', 4, 0.3, [
              ['burst pipe repair', 0.5, 1, 1],
              ['how to fix burst pipe yourself', 0.35, 0, 0.9],
            ]),
          ]),
        ],
        landingPages: [{ path: '/emergency', weight: 1 }],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '21003',
        name: 'Services — Competitor Terms',
        status: 'ENABLED',
        channelType: 'SEARCH',
        objective: 'SEARCH',
        pattern: 'CPA_ABOVE_TARGET',
        dailyBudget: 380,
        impressions: 3100,
        ctr: 0.028,
        cpc: 4.2,
        cvr: 0.025,
        avgValue: 140,
        impressionShare: 0.33,
        budgetLostShare: 0.2,
        adGroups: [
          group('31004', 'Competitor brands', 1, [
            kw(
              '41006',
              'acme hvac',
              'PHRASE',
              3,
              0.6,
              [
                ['acme hvac reviews', 0.4, 0.4, 1],
                ['acme hvac phone number', 0.35, 0.2, 1],
              ],
              0.7,
            ),
            kw(
              '41007',
              'bolt plumbing',
              'PHRASE',
              4,
              0.4,
              [
                ['bolt plumbing prices', 0.5, 0.6, 1],
                ['bolt plumbing careers', 0.3, 0, 1],
              ],
              0.8,
            ),
          ]),
        ],
        landingPages: [{ path: '/compare', weight: 1 }],
        deviceCvr: DEVICE_MOBILE_WEAK,
      },
      {
        id: '21004',
        name: 'Display — Local Awareness',
        status: 'ENABLED',
        channelType: 'DISPLAY',
        objective: 'DISPLAY',
        pattern: 'IMPRESSIONS_DROP',
        dailyBudget: 100,
        impressions: 65000,
        ctr: 0.0035,
        cpc: 0.4,
        cvr: 0.012,
        avgValue: 140,
        impressionShare: null,
        budgetLostShare: null,
        adGroups: [group('31005', 'Homeowners 10km radius', 1)],
        landingPages: [{ path: '/', weight: 1 }],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '21005',
        name: 'Lead Gen — Quote Requests',
        status: 'ENABLED',
        channelType: 'SEARCH',
        objective: 'LEAD_GENERATION',
        pattern: 'HIGH_BOUNCE',
        dailyBudget: 800,
        impressions: 6200,
        ctr: 0.05,
        cpc: 2.4,
        cvr: 0.07,
        avgValue: 140,
        impressionShare: 0.64,
        budgetLostShare: 0.06,
        adGroups: [
          group('31006', 'Free quote', 1, [
            kw('41008', 'hvac quote', 'PHRASE', 7, 0.6, [
              ['free hvac quote', 0.5, 1, 1],
              ['hvac quote online', 0.35, 1.1, 1],
            ]),
            kw('41009', 'plumbing estimate', 'BROAD', 5, 0.4, [
              ['plumbing estimate', 0.5, 1, 1],
              ['plumbing estimate template', 0.3, 0, 0.9],
            ]),
          ]),
        ],
        landingPages: [
          { path: '/quote', weight: 0.75 },
          { path: '/quote/express', weight: 0.25 },
        ],
        deviceCvr: DEVICE_NEUTRAL,
      },
      {
        id: '21006',
        name: 'Remarketing — Site Visitors',
        status: 'ENABLED',
        channelType: 'DISPLAY',
        objective: 'REMARKETING',
        pattern: 'HEALTHY',
        dailyBudget: 80,
        impressions: 15000,
        ctr: 0.006,
        cpc: 0.7,
        cvr: 0.06,
        avgValue: 140,
        impressionShare: null,
        budgetLostShare: null,
        adGroups: [group('31007', 'Visitors 30 days', 1)],
        landingPages: [{ path: '/offers', weight: 1 }],
        deviceCvr: DEVICE_NEUTRAL,
      },
    ],
  },
];

/** GA4 bounce rate per landing page path; one page is intentionally problematic. */
export const MOCK_BOUNCE_RATES: Record<string, number> = {
  '/quote': 0.82,
  '/explore': 0.71,
  '/compare': 0.64,
};

export const DEFAULT_BOUNCE_RATE = 0.38;
