import type { KpiKey } from '@adpulse/types';

export type MetricFormat = 'currency' | 'percent' | 'integer' | 'decimal' | 'ratio';

/** higher = increase is good, lower = decrease is good, neutral = direction carries no judgement (e.g. spend). */
export type MetricDirection = 'higher' | 'lower' | 'neutral';

export interface MetricDefinition {
  key: KpiKey;
  label: string;
  shortLabel: string;
  format: MetricFormat;
  direction: MetricDirection;
  decimals: number;
  description: string;
  formula: string | null;
}

export const METRIC_DEFINITIONS: Record<KpiKey, MetricDefinition> = {
  cost: {
    key: 'cost',
    label: 'Spend',
    shortLabel: 'Spend',
    format: 'currency',
    direction: 'neutral',
    decimals: 2,
    description: 'Total advertising cost in the account currency.',
    formula: null,
  },
  impressions: {
    key: 'impressions',
    label: 'Impressions',
    shortLabel: 'Impr.',
    format: 'integer',
    direction: 'higher',
    decimals: 0,
    description: 'Number of times ads were shown.',
    formula: null,
  },
  clicks: {
    key: 'clicks',
    label: 'Clicks',
    shortLabel: 'Clicks',
    format: 'integer',
    direction: 'higher',
    decimals: 0,
    description: 'Number of ad clicks.',
    formula: null,
  },
  ctr: {
    key: 'ctr',
    label: 'Click-through rate',
    shortLabel: 'CTR',
    format: 'percent',
    direction: 'higher',
    decimals: 2,
    description: 'Share of impressions that resulted in a click.',
    formula: 'Clicks ÷ Impressions × 100',
  },
  cpc: {
    key: 'cpc',
    label: 'Cost per click',
    shortLabel: 'CPC',
    format: 'currency',
    direction: 'lower',
    decimals: 2,
    description: 'Average amount paid for each click.',
    formula: 'Cost ÷ Clicks',
  },
  cpm: {
    key: 'cpm',
    label: 'Cost per 1,000 impressions',
    shortLabel: 'CPM',
    format: 'currency',
    direction: 'lower',
    decimals: 2,
    description: 'Average cost for one thousand impressions.',
    formula: 'Cost ÷ Impressions × 1,000',
  },
  conversions: {
    key: 'conversions',
    label: 'Conversions',
    shortLabel: 'Conv.',
    format: 'decimal',
    direction: 'higher',
    decimals: 1,
    description: 'Conversions attributed to ads (may be fractional with data-driven attribution).',
    formula: null,
  },
  conversionRate: {
    key: 'conversionRate',
    label: 'Conversion rate',
    shortLabel: 'Conv. rate',
    format: 'percent',
    direction: 'higher',
    decimals: 2,
    description: 'Share of clicks that resulted in a conversion.',
    formula: 'Conversions ÷ Clicks × 100',
  },
  cpa: {
    key: 'cpa',
    label: 'Cost per acquisition',
    shortLabel: 'CPA',
    format: 'currency',
    direction: 'lower',
    decimals: 2,
    description: 'Average cost for each conversion.',
    formula: 'Cost ÷ Conversions',
  },
  conversionValue: {
    key: 'conversionValue',
    label: 'Conversion value',
    shortLabel: 'Conv. value',
    format: 'currency',
    direction: 'higher',
    decimals: 2,
    description: 'Total value of attributed conversions.',
    formula: null,
  },
  roas: {
    key: 'roas',
    label: 'Return on ad spend',
    shortLabel: 'ROAS',
    format: 'ratio',
    direction: 'higher',
    decimals: 2,
    description: 'Conversion value generated for each unit of spend.',
    formula: 'Conversion value ÷ Cost',
  },
};

export const KPI_KEYS = Object.keys(METRIC_DEFINITIONS) as KpiKey[];
