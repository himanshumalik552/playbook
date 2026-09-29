import type { BrandingSettings, ReportingPreferences } from './api';
import type { ActionStatus, AlertType, CampaignObjective, RecommendationType } from './enums';

export const DEFAULT_REPORTING_PREFERENCES: ReportingPreferences = {
  defaultDateRangeDays: 30,
  weekStartsOn: 1,
  compareByDefault: true,
  weeklyReportEnabled: true,
  monthlyReportEnabled: true,
  dailySummaryEnabled: true,
};

export const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#3949AB',
  logoUrl: null,
  reportFooter: null,
};

/** Sections included in every generated report, in rendering order. */
export const REPORT_SECTIONS = [
  { key: 'cover', label: 'Cover page' },
  { key: 'executiveSummary', label: 'Executive summary' },
  { key: 'kpiOverview', label: 'KPI overview' },
  { key: 'periodComparison', label: 'Period-over-period comparison' },
  { key: 'targets', label: 'Performance against targets' },
  { key: 'trends', label: 'Trend charts' },
  { key: 'topCampaigns', label: 'Top campaigns' },
  { key: 'underperformingCampaigns', label: 'Underperforming campaigns' },
  { key: 'keywords', label: 'Keyword performance' },
  { key: 'searchTerms', label: 'Search-term insights' },
  { key: 'landingPages', label: 'Landing-page performance' },
  { key: 'alerts', label: 'Alerts raised' },
  { key: 'actions', label: 'Completed optimization actions' },
  { key: 'risksAndNextSteps', label: 'Risks and next actions' },
  { key: 'dataFreshness', label: 'Data freshness and methodology' },
] as const;

export type ReportSectionKey = (typeof REPORT_SECTIONS)[number]['key'];

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  HIGH_SPEND_ZERO_CONVERSIONS: 'High spend with zero conversions',
  CPA_ABOVE_TARGET: 'CPA above target',
  ROAS_BELOW_TARGET: 'ROAS below target',
  CTR_BELOW_TARGET: 'CTR below target',
  CPC_INCREASE: 'CPC increase',
  CONVERSION_RATE_DECLINE: 'Conversion-rate decline',
  SPEND_PACING: 'Spend pacing off plan',
  IMPRESSIONS_DROP: 'Sudden impressions drop',
  STRONG_ROAS_CONSTRAINED: 'Strong ROAS, constrained volume',
  HIGH_BOUNCE_RATE: 'High landing-page bounce rate',
  MISSING_DATA: 'Missing data',
  CONVERSION_TRACKING_FAILURE: 'Possible conversion-tracking failure',
  SYNC_FAILED: 'Failed synchronization',
  OAUTH_ATTENTION: 'Connection requires attention',
};

export const RECOMMENDATION_TYPE_LABELS: Record<RecommendationType, string> = {
  REVIEW_EXPENSIVE_SEARCH_TERMS: 'Review expensive search terms',
  NEGATIVE_KEYWORD_CANDIDATES: 'Negative keyword candidates',
  IMPROVE_AD_RELEVANCE: 'Improve ad-message relevance',
  LANDING_PAGE_CONVERSION_DECLINE: 'Investigate landing-page conversion decline',
  REVIEW_DEVICE_PERFORMANCE: 'Review device performance',
  REVIEW_LOCATION_PERFORMANCE: 'Review location performance',
  CONTROLLED_BUDGET_SCALING: 'Consider controlled budget scaling',
  REALLOCATE_BUDGET: 'Reallocate budget from weak segments',
};

export const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  SEARCH: 'Search',
  DISPLAY: 'Display',
  REMARKETING: 'Remarketing',
  LEAD_GENERATION: 'Lead generation',
  ECOMMERCE: 'Ecommerce',
};

/** Allowed status transitions for optimization actions. Cancellation always requires a reason. */
export const ACTION_WORKFLOW: Record<ActionStatus, readonly ActionStatus[]> = {
  BACKLOG: ['PLANNED', 'CANCELLED'],
  PLANNED: ['BACKLOG', 'IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PLANNED', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['EVALUATED', 'IN_PROGRESS'],
  EVALUATED: [],
  CANCELLED: [],
};
