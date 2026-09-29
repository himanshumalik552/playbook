import { formatCurrency, formatPercent, formatRatio, safeDivide } from '@adpulse/kpi';
import type {
  ConfidenceLevel,
  EntityType,
  KpiValues,
  RecommendationEvidenceItem,
  RecommendationType,
} from '@adpulse/types';
import { classifySearchTerm } from '../search-terms/classify';

export interface RecCampaign {
  id: string;
  name: string;
  adAccountId: string;
  currencyCode: string;
  current: KpiValues;
  targetCpa: number;
  targetRoas: number;
  budgetLostImpressionShare: number | null;
  dailyBudget: number | null;
}

export interface RecSegment {
  campaignId: string;
  key: string;
  label: string;
  metrics: KpiValues;
}

export interface RecKeyword {
  id: string;
  campaignId: string;
  text: string;
  qualityScore: number | null;
  metrics: KpiValues;
}

export interface RecLandingPage {
  id: string;
  url: string;
  campaignId: string;
  current: KpiValues;
  baseline: KpiValues;
}

export interface RecommendationInput {
  window: { from: string; to: string };
  campaigns: RecCampaign[];
  searchTerms: (RecSegment & { id: string })[];
  keywords: RecKeyword[];
  devices: RecSegment[];
  locations: RecSegment[];
  landingPages: RecLandingPage[];
}

export interface RecommendationCandidate {
  type: RecommendationType;
  title: string;
  rationale: string;
  evidence: RecommendationEvidenceItem[];
  affectedMetrics: string[];
  confidence: ConfidenceLevel;
  entityType: EntityType;
  entityId: string | null;
  entityName: string | null;
  campaignId: string | null;
  adAccountId: string | null;
  fingerprint: string;
}

const CORRELATION_NOTE =
  'This pattern is correlational; validate with a controlled change and monitor results before drawing conclusions.';

export function confidenceFromVolume(clicks: number, conversions: number): ConfidenceLevel {
  if (clicks >= 500 && conversions >= 20) return 'HIGH';
  if (clicks >= 100) return 'MEDIUM';
  return 'LOW';
}

const pct = (v: number | null) => formatPercent(v, { decimals: 1 });

function byCampaign<T extends { campaignId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(item.campaignId, [...(map.get(item.campaignId) ?? []), item]);
  return map;
}

function searchTermRecommendations(input: RecommendationInput): RecommendationCandidate[] {
  const terms = byCampaign(input.searchTerms);
  return input.campaigns.flatMap((c) => {
    const classified = (terms.get(c.id) ?? []).map((t) => ({
      t,
      cls: classifySearchTerm(t.metrics, c.targetCpa, c.currencyCode),
    }));
    const money = (v: number) => formatCurrency(v, { currency: c.currencyCode });
    const out: RecommendationCandidate[] = [];

    const expensive = classified
      .filter((x) => x.cls.flag === 'EXPENSIVE')
      .sort((a, b) => b.t.metrics.cost - a.t.metrics.cost);
    if (expensive.length > 0) {
      const cost = expensive.reduce((s, x) => s + x.t.metrics.cost, 0);
      const clicks = expensive.reduce((s, x) => s + x.t.metrics.clicks, 0);
      out.push({
        type: 'REVIEW_EXPENSIVE_SEARCH_TERMS',
        title: `Review ${expensive.length} expensive search term${expensive.length > 1 ? 's' : ''} in ${c.name}`,
        rationale: `These terms converted at more than twice the ${money(c.targetCpa)} CPA target and account for ${money(cost)} of spend. Consider tightening match types or bids for them. ${CORRELATION_NOTE}`,
        evidence: expensive.slice(0, 5).map((x) => ({
          label: x.t.label,
          value: `${money(x.t.metrics.cost)} · CPA ${money(x.t.metrics.cpa ?? 0)}`,
        })),
        affectedMetrics: ['cpa', 'cost'],
        confidence: confidenceFromVolume(
          clicks,
          expensive.reduce((s, x) => s + x.t.metrics.conversions, 0),
        ),
        entityType: 'CAMPAIGN',
        entityId: c.id,
        entityName: c.name,
        campaignId: c.id,
        adAccountId: c.adAccountId,
        fingerprint: `REVIEW_EXPENSIVE_SEARCH_TERMS:${c.id}`,
      });
    }

    const negatives = classified
      .filter((x) => x.cls.flag === 'NEGATIVE_CANDIDATE')
      .sort((a, b) => b.t.metrics.cost - a.t.metrics.cost);
    if (negatives.length > 0) {
      const cost = negatives.reduce((s, x) => s + x.t.metrics.cost, 0);
      const clicks = negatives.reduce((s, x) => s + x.t.metrics.clicks, 0);
      out.push({
        type: 'NEGATIVE_KEYWORD_CANDIDATES',
        title: `${negatives.length} negative keyword candidate${negatives.length > 1 ? 's' : ''} in ${c.name}`,
        rationale: `These queries received ${clicks} clicks (${money(cost)}) with no conversions between ${input.window.from} and ${input.window.to}. Review search intent manually; nothing is added to Google Ads automatically. ${CORRELATION_NOTE}`,
        evidence: negatives.slice(0, 8).map((x) => ({
          label: x.t.label,
          value: `${x.t.metrics.clicks} clicks · ${money(x.t.metrics.cost)}`,
        })),
        affectedMetrics: ['cost', 'conversionRate'],
        confidence: clicks >= 100 ? 'HIGH' : clicks >= 40 ? 'MEDIUM' : 'LOW',
        entityType: 'CAMPAIGN',
        entityId: c.id,
        entityName: c.name,
        campaignId: c.id,
        adAccountId: c.adAccountId,
        fingerprint: `NEGATIVE_KEYWORD_CANDIDATES:${c.id}`,
      });
    }
    return out;
  });
}

function adRelevanceRecommendations(input: RecommendationInput): RecommendationCandidate[] {
  const campaigns = new Map(input.campaigns.map((c) => [c.id, c]));
  return input.keywords.flatMap((k) => {
    const c = campaigns.get(k.campaignId);
    if (!c || k.qualityScore === null || k.qualityScore > 5 || k.metrics.impressions < 500) return [];
    if (k.metrics.ctr === null || c.current.ctr === null || k.metrics.ctr >= c.current.ctr) return [];
    return [
      {
        type: 'IMPROVE_AD_RELEVANCE' as const,
        title: `Improve ad relevance for "${k.text}"`,
        rationale: `Quality Score is ${k.qualityScore}/10 and CTR (${pct(k.metrics.ctr)}) trails the campaign average (${pct(c.current.ctr)}). Low scores are associated with higher CPCs; aligning ad copy and landing page with the keyword theme may help. ${CORRELATION_NOTE}`,
        evidence: [
          { label: 'Quality Score', value: `${k.qualityScore}/10` },
          { label: 'Keyword CTR', value: pct(k.metrics.ctr) },
          { label: 'Campaign CTR', value: pct(c.current.ctr) },
          { label: 'Keyword CPC', value: formatCurrency(k.metrics.cpc, { currency: c.currencyCode }) },
        ],
        affectedMetrics: ['ctr', 'cpc'],
        confidence: confidenceFromVolume(k.metrics.clicks, k.metrics.conversions),
        entityType: 'KEYWORD' as const,
        entityId: k.id,
        entityName: k.text,
        campaignId: c.id,
        adAccountId: c.adAccountId,
        fingerprint: `IMPROVE_AD_RELEVANCE:${k.id}`,
      },
    ];
  });
}

function landingPageRecommendations(input: RecommendationInput): RecommendationCandidate[] {
  const campaigns = new Map(input.campaigns.map((c) => [c.id, c]));
  return input.landingPages.flatMap((p) => {
    const cur = p.current.conversionRate;
    const base = p.baseline.conversionRate;
    if (cur === null || base === null || base === 0 || p.current.clicks < 100 || p.baseline.clicks < 100)
      return [];
    const change = (safeDivide(cur - base, base)?.toNumber() ?? 0) * 100;
    if (change > -25) return [];
    const c = campaigns.get(p.campaignId);
    return [
      {
        type: 'LANDING_PAGE_CONVERSION_DECLINE' as const,
        title: `Investigate conversion decline on ${new URL(p.url).pathname}`,
        rationale: `Conversion rate from paid clicks fell from ${pct(base)} to ${pct(cur)} (${change.toFixed(1)}%). Check for page changes, load-time regressions or form issues that coincide with the decline. ${CORRELATION_NOTE}`,
        evidence: [
          { label: 'Current conversion rate', value: pct(cur) },
          { label: 'Baseline conversion rate', value: pct(base) },
          { label: 'Clicks (current)', value: p.current.clicks.toLocaleString('en-US') },
          { label: 'Campaign', value: c?.name ?? '—' },
        ],
        affectedMetrics: ['conversionRate', 'cpa'],
        confidence: confidenceFromVolume(p.current.clicks, p.current.conversions),
        entityType: 'LANDING_PAGE' as const,
        entityId: p.id,
        entityName: p.url,
        campaignId: p.campaignId,
        adAccountId: c?.adAccountId ?? null,
        fingerprint: `LANDING_PAGE_CONVERSION_DECLINE:${p.id}:${p.campaignId}`,
      },
    ];
  });
}

function segmentRecommendations(
  input: RecommendationInput,
  segments: RecSegment[],
  type: 'REVIEW_DEVICE_PERFORMANCE' | 'REVIEW_LOCATION_PERFORMANCE',
  noun: string,
): RecommendationCandidate[] {
  const grouped = byCampaign(segments);
  return input.campaigns.flatMap((c) => {
    const campaignCpa = c.current.cpa;
    if (campaignCpa === null || c.current.cost <= 0) return [];
    const money = (v: number) => formatCurrency(v, { currency: c.currencyCode });
    const weak = (grouped.get(c.id) ?? []).filter((s) => {
      const share = s.metrics.cost / c.current.cost;
      if (share < 0.1 || s.metrics.clicks < 50) return false;
      return s.metrics.cpa === null ? s.metrics.cost > c.targetCpa * 2 : s.metrics.cpa > campaignCpa * 1.4;
    });
    if (weak.length === 0) return [];
    return [
      {
        type,
        title: `Review ${noun} performance in ${c.name}`,
        rationale: `${weak.map((s) => s.label).join(', ')} ${weak.length > 1 ? 'show' : 'shows'} a cost per conversion at least 40% above the campaign average of ${money(campaignCpa)}. A bid adjustment or exclusion could be tested; differences may also reflect audience mix rather than the ${noun} itself. ${CORRELATION_NOTE}`,
        evidence: weak.slice(0, 6).map((s) => ({
          label: s.label,
          value: `${money(s.metrics.cost)} · CPA ${s.metrics.cpa === null ? 'no conversions' : money(s.metrics.cpa)}`,
        })),
        affectedMetrics: ['cpa', 'conversionRate'],
        confidence: confidenceFromVolume(
          weak.reduce((s, x) => s + x.metrics.clicks, 0),
          weak.reduce((s, x) => s + x.metrics.conversions, 0),
        ),
        entityType: 'CAMPAIGN' as const,
        entityId: c.id,
        entityName: c.name,
        campaignId: c.id,
        adAccountId: c.adAccountId,
        fingerprint: `${type}:${c.id}`,
      },
    ];
  });
}

function budgetScalingRecommendations(input: RecommendationInput): RecommendationCandidate[] {
  return input.campaigns.flatMap((c) => {
    const lost = c.budgetLostImpressionShare;
    if (c.current.roas === null || lost === null || lost < 0.2 || c.current.roas < c.targetRoas * 1.5)
      return [];
    return [
      {
        type: 'CONTROLLED_BUDGET_SCALING' as const,
        title: `Consider a controlled budget increase for ${c.name}`,
        rationale: `ROAS of ${formatRatio(c.current.roas)} exceeds the ${formatRatio(c.targetRoas)} target while ${pct(lost * 100)} of impression share is lost to budget. A 10–20% increase with a two-week review would test whether marginal returns hold; returns usually diminish as spend grows. ${CORRELATION_NOTE}`,
        evidence: [
          { label: 'ROAS', value: formatRatio(c.current.roas) },
          { label: 'Target ROAS', value: formatRatio(c.targetRoas) },
          { label: 'Impression share lost to budget', value: pct(lost * 100) },
          {
            label: 'Current daily budget',
            value: formatCurrency(c.dailyBudget, { currency: c.currencyCode }),
          },
        ],
        affectedMetrics: ['roas', 'cost', 'conversionValue'],
        confidence: confidenceFromVolume(c.current.clicks, c.current.conversions),
        entityType: 'CAMPAIGN' as const,
        entityId: c.id,
        entityName: c.name,
        campaignId: c.id,
        adAccountId: c.adAccountId,
        fingerprint: `CONTROLLED_BUDGET_SCALING:${c.id}`,
      },
    ];
  });
}

function reallocationRecommendations(input: RecommendationInput): RecommendationCandidate[] {
  const accounts = new Map<string, RecCampaign[]>();
  for (const c of input.campaigns) accounts.set(c.adAccountId, [...(accounts.get(c.adAccountId) ?? []), c]);
  return [...accounts.entries()].flatMap(([adAccountId, campaigns]) => {
    const total = campaigns.reduce((s, c) => s + c.current.cost, 0);
    if (total <= 0) return [];
    const weak = campaigns
      .filter((c) => c.current.cost / total >= 0.1 && (c.current.roas ?? 0) < c.targetRoas * 0.7)
      .sort((a, b) => (a.current.roas ?? 0) - (b.current.roas ?? 0))[0];
    const strong = campaigns
      .filter((c) => (c.current.roas ?? 0) > c.targetRoas * 1.3 && (c.budgetLostImpressionShare ?? 0) >= 0.1)
      .sort((a, b) => (b.current.roas ?? 0) - (a.current.roas ?? 0))[0];
    if (!weak || !strong || weak.id === strong.id) return [];
    const money = (v: number) => formatCurrency(v, { currency: weak.currencyCode });
    return [
      {
        type: 'REALLOCATE_BUDGET' as const,
        title: `Test shifting budget from ${weak.name} to ${strong.name}`,
        rationale: `${weak.name} returned ${formatRatio(weak.current.roas)} on ${money(weak.current.cost)} spend, while ${strong.name} returned ${formatRatio(strong.current.roas)} and is limited by budget. A gradual reallocation could improve blended ROAS, but campaigns may serve different funnel roles; confirm with a time-boxed test. ${CORRELATION_NOTE}`,
        evidence: [
          { label: `${weak.name} ROAS`, value: formatRatio(weak.current.roas) },
          { label: `${weak.name} spend share`, value: pct((weak.current.cost / total) * 100) },
          { label: `${strong.name} ROAS`, value: formatRatio(strong.current.roas) },
          {
            label: `${strong.name} lost IS (budget)`,
            value: pct((strong.budgetLostImpressionShare ?? 0) * 100),
          },
        ],
        affectedMetrics: ['roas', 'cost'],
        confidence: 'MEDIUM' as const,
        entityType: 'AD_ACCOUNT' as const,
        entityId: adAccountId,
        entityName: null,
        campaignId: weak.id,
        adAccountId,
        fingerprint: `REALLOCATE_BUDGET:${adAccountId}:${weak.id}:${strong.id}`,
      },
    ];
  });
}

export function generateRecommendations(input: RecommendationInput): RecommendationCandidate[] {
  return [
    ...searchTermRecommendations(input),
    ...adRelevanceRecommendations(input),
    ...landingPageRecommendations(input),
    ...segmentRecommendations(input, input.devices, 'REVIEW_DEVICE_PERFORMANCE', 'device'),
    ...segmentRecommendations(input, input.locations, 'REVIEW_LOCATION_PERFORMANCE', 'location'),
    ...budgetScalingRecommendations(input),
    ...reallocationRecommendations(input),
  ];
}
