import { describe, expect, it } from 'vitest';
import {
  confidenceFromVolume,
  generateRecommendations,
  type RecCampaign,
  type RecommendationInput,
} from '../src/recommendations/rules';
import { kpis } from './fixtures';

function campaign(overrides: Partial<RecCampaign> = {}): RecCampaign {
  return {
    id: 'c1',
    name: 'Generic Search',
    adAccountId: 'a1',
    currencyCode: 'USD',
    current: kpis({ impressions: 20_000, clicks: 1000, cost: 1000, conversions: 40, conversionValue: 4000 }),
    targetCpa: 50,
    targetRoas: 3,
    budgetLostImpressionShare: 0,
    dailyBudget: 100,
    ...overrides,
  };
}

function input(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    window: { from: '2026-09-14', to: '2026-09-27' },
    campaigns: [campaign()],
    searchTerms: [],
    keywords: [],
    devices: [],
    locations: [],
    landingPages: [],
    ...overrides,
  };
}

const types = (i: RecommendationInput) => generateRecommendations(i).map((r) => r.type);

describe('generateRecommendations', () => {
  it('returns nothing for healthy data', () => {
    expect(generateRecommendations(input())).toEqual([]);
  });

  it('never claims causation', () => {
    const recs = generateRecommendations(
      input({
        searchTerms: [
          {
            id: 's1',
            campaignId: 'c1',
            key: 'k',
            label: 'free tents',
            metrics: kpis({ clicks: 40, cost: 80, impressions: 400 }),
          },
        ],
      }),
    );
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.rationale).toContain('correlational');
      expect(r.rationale).not.toMatch(/\bcaused\b|\bbecause of\b/i);
    }
  });

  it('suggests negative keyword candidates and expensive term reviews without applying them', () => {
    const recs = generateRecommendations(
      input({
        searchTerms: [
          {
            id: 's1',
            campaignId: 'c1',
            key: 'a',
            label: 'free tents',
            metrics: kpis({ clicks: 120, cost: 150, impressions: 2000 }),
          },
          {
            id: 's2',
            campaignId: 'c1',
            key: 'b',
            label: 'luxury tent',
            metrics: kpis({ clicks: 90, cost: 250, conversions: 2, impressions: 900 }),
          },
        ],
      }),
    );
    const negative = recs.find((r) => r.type === 'NEGATIVE_KEYWORD_CANDIDATES');
    expect(negative?.confidence).toBe('HIGH');
    expect(negative?.rationale).toContain('nothing is added to Google Ads automatically');
    expect(negative?.evidence[0]?.label).toBe('free tents');
    const expensive = recs.find((r) => r.type === 'REVIEW_EXPENSIVE_SEARCH_TERMS');
    expect(expensive?.title).toContain('1 expensive search term in');
  });

  it('suggests improving ad relevance for low quality-score keywords', () => {
    const recs = generateRecommendations(
      input({
        keywords: [
          {
            id: 'k1',
            campaignId: 'c1',
            text: 'tents',
            qualityScore: 4,
            metrics: kpis({ impressions: 5000, clicks: 100, cost: 150, conversions: 2 }),
          },
          {
            id: 'k2',
            campaignId: 'c1',
            text: 'good',
            qualityScore: 8,
            metrics: kpis({ impressions: 5000, clicks: 50, cost: 50 }),
          },
          {
            id: 'k3',
            campaignId: 'missing',
            text: 'orphan',
            qualityScore: 2,
            metrics: kpis({ impressions: 5000, clicks: 50 }),
          },
        ],
      }),
    );
    expect(recs.map((r) => r.entityId)).toEqual(['k1']);
    expect(recs[0]).toMatchObject({
      type: 'IMPROVE_AD_RELEVANCE',
      entityType: 'KEYWORD',
      confidence: 'MEDIUM',
    });
  });

  it('flags landing page conversion declines', () => {
    const recs = generateRecommendations(
      input({
        landingPages: [
          {
            id: 'lp1',
            url: 'https://example.com/tents?utm=1',
            campaignId: 'c1',
            current: kpis({ clicks: 400, conversions: 4 }),
            baseline: kpis({ clicks: 400, conversions: 16 }),
          },
          {
            id: 'lp2',
            url: 'https://example.com/ok',
            campaignId: 'c1',
            current: kpis({ clicks: 400, conversions: 16 }),
            baseline: kpis({ clicks: 400, conversions: 16 }),
          },
        ],
      }),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]?.title).toContain('/tents');
    expect(recs[0]?.fingerprint).toBe('LANDING_PAGE_CONVERSION_DECLINE:lp1:c1');
  });

  it('flags weak device and location segments', () => {
    const segment = (key: string, label: string, cost: number, conversions: number) => ({
      campaignId: 'c1',
      key,
      label,
      metrics: kpis({ clicks: 200, cost, conversions, impressions: 4000 }),
    });
    const recs = generateRecommendations(
      input({
        devices: [segment('MOBILE', 'Mobile', 400, 4), segment('DESKTOP', 'Desktop', 600, 36)],
        locations: [segment('1', 'Denver', 150, 0), segment('2', 'Austin', 50, 0)],
      }),
    );
    const device = recs.find((r) => r.type === 'REVIEW_DEVICE_PERFORMANCE');
    expect(device?.rationale).toContain('Mobile shows');
    const location = recs.find((r) => r.type === 'REVIEW_LOCATION_PERFORMANCE');
    expect(location?.evidence[0]?.value).toContain('no conversions');
  });

  it('suggests controlled budget scaling and reallocation', () => {
    const strong = campaign({
      id: 'strong',
      name: 'Shopping',
      current: kpis({ impressions: 20_000, clicks: 800, cost: 800, conversions: 40, conversionValue: 6000 }),
      budgetLostImpressionShare: 0.3,
    });
    const weak = campaign({
      id: 'weak',
      name: 'Display',
      current: kpis({ impressions: 90_000, clicks: 900, cost: 1200, conversions: 10, conversionValue: 1200 }),
    });
    const recs = generateRecommendations(input({ campaigns: [strong, weak] }));
    expect(recs.find((r) => r.type === 'CONTROLLED_BUDGET_SCALING')?.entityId).toBe('strong');
    const realloc = recs.find((r) => r.type === 'REALLOCATE_BUDGET');
    expect(realloc).toMatchObject({ campaignId: 'weak', fingerprint: 'REALLOCATE_BUDGET:a1:weak:strong' });
  });

  it('skips reallocation when an account has no spend', () => {
    expect(types(input({ campaigns: [campaign({ current: kpis({}) })] }))).toEqual([]);
  });
});

describe('confidenceFromVolume', () => {
  it('scales with clicks and conversions', () => {
    expect(confidenceFromVolume(600, 25)).toBe('HIGH');
    expect(confidenceFromVolume(600, 5)).toBe('MEDIUM');
    expect(confidenceFromVolume(20, 0)).toBe('LOW');
  });
});
