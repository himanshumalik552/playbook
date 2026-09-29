import { addDays, daysInRange } from '@adpulse/kpi';
import type { Device } from '@adpulse/types';
import {
  DEFAULT_BOUNCE_RATE,
  MOCK_BOUNCE_RATES,
  MOCK_DEVICE_SHARES,
  MOCK_LOCATIONS,
  type MockAccountDef,
  type MockCampaignDef,
  type PerformancePattern,
} from './catalog';
import { allocate, createRandom, noise, round } from './random';

export interface MetricCell {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
}

export interface GeneratedCampaignDay extends MetricCell {
  date: string;
  campaignId: string;
  searchImpressionShare: number | null;
  searchTopImpressionShare: number | null;
  searchAbsoluteTopImpressionShare: number | null;
  searchBudgetLostImpressionShare: number | null;
  adGroups: (MetricCell & { adGroupId: string })[];
  keywords: (MetricCell & { keywordId: string; adGroupId: string; qualityScore: number })[];
  searchTerms: (MetricCell & { term: string; keywordId: string; adGroupId: string })[];
  devices: (MetricCell & { device: Device })[];
  locations: (MetricCell & {
    locationId: string;
    locationName: string;
    countryCode: string;
    device: Device;
  })[];
  landingPages: (MetricCell & {
    url: string;
    sessions: number;
    engagedSessions: number;
    keyEvents: number;
  })[];
}

const EMPTY: MetricCell = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 };

interface Factors {
  impressions: number;
  ctr: number;
  cpc: number;
  cvr: number;
  zeroConversions: boolean;
}

/** Linear ramp from 0 (at `window` days ago) to 1 (today). */
const ramp = (daysAgo: number, window: number) => Math.max(0, (window - daysAgo) / window);

export function patternFactors(pattern: PerformancePattern, daysAgo: number): Factors {
  const f: Factors = { impressions: 1, ctr: 1, cpc: 1, cvr: 1, zeroConversions: false };
  switch (pattern) {
    case 'RISING_CPC':
      f.cpc = 1 + 0.5 * ramp(daysAgo, 28);
      break;
    case 'FALLING_CVR':
      f.cvr = 1 - 0.55 * ramp(daysAgo, 21);
      break;
    case 'SPEND_NO_CONVERSIONS':
      f.zeroConversions = daysAgo < 14;
      break;
    case 'IMPRESSIONS_DROP':
      if (daysAgo < 4) f.impressions = 0.3;
      break;
    case 'HIGH_BOUNCE':
      f.cvr = 1 - 0.25 * ramp(daysAgo, 30);
      break;
    case 'HEALTHY':
    case 'CPA_ABOVE_TARGET':
    case 'STRONG_ROAS_LOW_VOLUME':
    case 'HIGH_IMPRESSIONS_LOW_CTR':
      break;
  }
  return f;
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function dayOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00.000Z`);
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000);
}

function splitCell(
  cell: MetricCell,
  weights: readonly number[],
  clickFactors: readonly number[],
  conversionFactors: readonly number[],
): MetricCell[] {
  const clickWeights = weights.map((w, i) => w * (clickFactors[i] ?? 1));
  const conversionWeights = clickWeights.map((w, i) => w * (conversionFactors[i] ?? 1));
  const impressions = allocate(cell.impressions, weights);
  const clicks = allocate(cell.clicks, clickWeights);
  const cost = allocate(cell.cost, clickWeights, 2);
  const conversions = allocate(cell.conversions, conversionWeights, 2);
  const conversionValue = allocate(cell.conversionValue, conversionWeights, 2);
  return weights.map((_, i) => ({
    impressions: Math.max(impressions[i] ?? 0, clicks[i] ?? 0),
    clicks: clicks[i] ?? 0,
    cost: cost[i] ?? 0,
    conversions: conversions[i] ?? 0,
    conversionValue: conversionValue[i] ?? 0,
  }));
}

export function landingPageUrl(account: MockAccountDef, path: string): string {
  return `${account.domain}${path}`;
}

/**
 * Deterministically generates one day of hierarchical performance data for a campaign.
 * `anchorDate` is the most recent day of data; performance patterns are expressed relative to it.
 */
export function generateCampaignDay(
  account: MockAccountDef,
  campaign: MockCampaignDef,
  date: string,
  anchorDate: string,
): GeneratedCampaignDay | null {
  const daysAgo = daysInRange({ from: date, to: anchorDate }) - 1;
  if (daysAgo < 0) return null;
  if (campaign.pausedDaysAgo !== undefined && daysAgo < campaign.pausedDaysAgo) return null;

  const random = createRandom(`${account.customerId}:${campaign.id}:${date}`);
  const factors = patternFactors(campaign.pattern, daysAgo);
  const weekend = [0, 6].includes(dayOfWeek(date));
  const seasonal = 1 + 0.08 * Math.sin((2 * Math.PI * dayOfYear(date)) / 365);
  const weekly = weekend ? (campaign.objective === 'LEAD_GENERATION' ? 0.78 : 1.12) : 1;

  let impressions = Math.round(
    campaign.impressions * seasonal * weekly * factors.impressions * noise(random, 0.1),
  );
  const ctr = campaign.ctr * factors.ctr * noise(random, 0.08);
  let clicks = Math.min(impressions, Math.round(impressions * ctr));
  const cpc = campaign.cpc * factors.cpc * noise(random, 0.07);
  let cost = round(clicks * cpc, 2);

  const cap = campaign.dailyBudget * 1.2;
  if (cost > cap) {
    const scale = cap / cost;
    impressions = Math.round(impressions * scale);
    clicks = Math.round(clicks * scale);
    cost = round(clicks * cpc, 2);
  }

  const cvr = campaign.cvr * factors.cvr * noise(random, 0.15);
  const conversions = factors.zeroConversions ? 0 : Math.round(clicks * cvr);
  const conversionValue = round(conversions * campaign.avgValue * noise(random, 0.12), 2);
  const total: MetricCell = { impressions, clicks, cost, conversions, conversionValue };

  // Google Ads reports search impression-share metrics for Search and Shopping campaigns only.
  const isSearch = campaign.channelType === 'SEARCH' || campaign.channelType === 'SHOPPING';
  const share = (value: number | null, spread: number) =>
    value === null ? null : round(Math.min(1, Math.max(0, value * noise(random, spread))), 4);
  const impressionShare = isSearch ? share(campaign.impressionShare, 0.05) : null;

  const adGroupCells = splitCell(
    total,
    campaign.adGroups.map((g) => g.weight),
    campaign.adGroups.map(() => noise(random, 0.05)),
    campaign.adGroups.map(() => noise(random, 0.1)),
  );
  const adGroups = campaign.adGroups.map((g, i) => ({ adGroupId: g.id, ...(adGroupCells[i] ?? EMPTY) }));

  const keywords: GeneratedCampaignDay['keywords'] = [];
  const searchTerms: GeneratedCampaignDay['searchTerms'] = [];
  campaign.adGroups.forEach((g, gi) => {
    if (g.keywords.length === 0) return;
    const groupCell = adGroupCells[gi] ?? EMPTY;
    const cells = splitCell(
      groupCell,
      g.keywords.map((k) => k.weight),
      g.keywords.map((k) => k.ctrFactor),
      g.keywords.map((k) => (k.qualityScore >= 7 ? 1.1 : 0.85)),
    );
    g.keywords.forEach((k, ki) => {
      const cell = cells[ki] ?? EMPTY;
      keywords.push({ keywordId: k.id, adGroupId: g.id, qualityScore: k.qualityScore, ...cell });
      const kwCpc = cell.clicks > 0 ? cell.cost / cell.clicks : 0;
      const kwCvr = cell.clicks > 0 ? cell.conversions / cell.clicks : campaign.cvr * factors.cvr;
      const kwValue = cell.conversions > 0 ? cell.conversionValue / cell.conversions : campaign.avgValue;
      for (const t of k.terms) {
        const termImpressions = Math.round(cell.impressions * t.share * noise(random, 0.15));
        const termClicks = Math.min(termImpressions, Math.round(cell.clicks * t.share * noise(random, 0.2)));
        if (termImpressions === 0) continue;
        const termConversions = factors.zeroConversions ? 0 : round(termClicks * kwCvr * t.cvrFactor, 2);
        searchTerms.push({
          term: t.term,
          keywordId: k.id,
          adGroupId: g.id,
          impressions: termImpressions,
          clicks: termClicks,
          cost: round(termClicks * kwCpc * t.cpcFactor, 2),
          conversions: termConversions,
          conversionValue: round(termConversions * kwValue, 2),
        });
      }
    });
  });

  const deviceKeys = Object.keys(MOCK_DEVICE_SHARES) as (keyof typeof MOCK_DEVICE_SHARES)[];
  const deviceCells = splitCell(
    total,
    deviceKeys.map((d) => MOCK_DEVICE_SHARES[d]),
    deviceKeys.map((d) => (d === 'MOBILE' ? 1.05 : 0.95)),
    deviceKeys.map((d) => campaign.deviceCvr[d]),
  );
  const devices = deviceKeys.map((device, i) => ({ device, ...(deviceCells[i] ?? EMPTY) }));

  const locations: GeneratedCampaignDay['locations'] = [];
  devices.forEach((deviceCell) => {
    const cells = splitCell(
      deviceCell,
      MOCK_LOCATIONS.map((l) => l.weight),
      MOCK_LOCATIONS.map(() => 1),
      MOCK_LOCATIONS.map((l) => l.cvr),
    );
    MOCK_LOCATIONS.forEach((l, i) => {
      locations.push({
        locationId: l.id,
        locationName: l.name,
        countryCode: l.countryCode,
        device: deviceCell.device,
        ...(cells[i] ?? EMPTY),
      });
    });
  });

  const pageCells = splitCell(
    total,
    campaign.landingPages.map((p) => p.weight),
    campaign.landingPages.map(() => 1),
    campaign.landingPages.map(
      (p) => 1 - (MOCK_BOUNCE_RATES[p.path] ?? DEFAULT_BOUNCE_RATE) + DEFAULT_BOUNCE_RATE,
    ),
  );
  const landingPages = campaign.landingPages.map((p, i) => {
    const cell = pageCells[i] ?? EMPTY;
    const bounce = Math.min(0.97, (MOCK_BOUNCE_RATES[p.path] ?? DEFAULT_BOUNCE_RATE) * noise(random, 0.06));
    const sessions = Math.round(cell.clicks * 0.93 * noise(random, 0.04));
    return {
      url: landingPageUrl(account, p.path),
      ...cell,
      sessions,
      engagedSessions: Math.round(sessions * (1 - bounce)),
      keyEvents: round(cell.conversions * 0.92, 2),
    };
  });

  return {
    date,
    campaignId: campaign.id,
    ...total,
    searchImpressionShare: impressionShare,
    searchTopImpressionShare: impressionShare === null ? null : round(impressionShare * 0.72, 4),
    searchAbsoluteTopImpressionShare: impressionShare === null ? null : round(impressionShare * 0.41, 4),
    searchBudgetLostImpressionShare: isSearch ? share(campaign.budgetLostShare, 0.1) : null,
    adGroups,
    keywords,
    searchTerms,
    devices,
    locations,
    landingPages,
  };
}

export function* generateAccountRange(
  account: MockAccountDef,
  from: string,
  to: string,
  anchorDate: string,
): Generator<GeneratedCampaignDay> {
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const campaign of account.campaigns) {
      const day = generateCampaignDay(account, campaign, date, anchorDate);
      if (day) yield day;
    }
  }
}
