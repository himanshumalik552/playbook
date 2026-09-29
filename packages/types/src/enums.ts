const values = <const T extends readonly string[]>(...items: T): T => items;

export const ORG_ROLES = values('ORGANIZATION_ADMIN', 'MARKETING_MANAGER', 'ANALYST', 'VIEWER');
export type OrgRole = (typeof ORG_ROLES)[number];

export const SYSTEM_ROLES = values('USER', 'SUPER_ADMIN');
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export type Role = OrgRole | 'SUPER_ADMIN';

export const CAMPAIGN_STATUSES = values('ENABLED', 'PAUSED', 'REMOVED');
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_OBJECTIVES = values('SEARCH', 'DISPLAY', 'REMARKETING', 'LEAD_GENERATION', 'ECOMMERCE');
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const CHANNEL_TYPES = values('SEARCH', 'DISPLAY', 'SHOPPING', 'PERFORMANCE_MAX', 'VIDEO');
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const DEVICES = values('DESKTOP', 'MOBILE', 'TABLET', 'OTHER');
export type Device = (typeof DEVICES)[number];

export const MATCH_TYPES = values('EXACT', 'PHRASE', 'BROAD');
export type MatchType = (typeof MATCH_TYPES)[number];

export const INTEGRATION_PROVIDERS = values('GOOGLE_ADS', 'GOOGLE_ANALYTICS');
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const CONNECTION_STATUSES = values('ACTIVE', 'NEEDS_ATTENTION', 'ERROR', 'REVOKED');
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const ALERT_SEVERITIES = values('INFO', 'WARNING', 'CRITICAL');
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = values('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_TYPES = values(
  'HIGH_SPEND_ZERO_CONVERSIONS',
  'CPA_ABOVE_TARGET',
  'ROAS_BELOW_TARGET',
  'CTR_BELOW_TARGET',
  'CPC_INCREASE',
  'CONVERSION_RATE_DECLINE',
  'SPEND_PACING',
  'IMPRESSIONS_DROP',
  'STRONG_ROAS_CONSTRAINED',
  'HIGH_BOUNCE_RATE',
  'MISSING_DATA',
  'CONVERSION_TRACKING_FAILURE',
  'SYNC_FAILED',
  'OAUTH_ATTENTION',
);
export type AlertType = (typeof ALERT_TYPES)[number];

export const ENTITY_TYPES = values(
  'ORGANIZATION',
  'AD_ACCOUNT',
  'CAMPAIGN',
  'AD_GROUP',
  'KEYWORD',
  'SEARCH_TERM',
  'LANDING_PAGE',
  'DEVICE',
  'LOCATION',
  'CONNECTION',
  'SYNC_JOB',
  'OPTIMIZATION_ACTION',
);
export type EntityType = (typeof ENTITY_TYPES)[number];

export const RECOMMENDATION_TYPES = values(
  'REVIEW_EXPENSIVE_SEARCH_TERMS',
  'NEGATIVE_KEYWORD_CANDIDATES',
  'IMPROVE_AD_RELEVANCE',
  'LANDING_PAGE_CONVERSION_DECLINE',
  'REVIEW_DEVICE_PERFORMANCE',
  'REVIEW_LOCATION_PERFORMANCE',
  'CONTROLLED_BUDGET_SCALING',
  'REALLOCATE_BUDGET',
);
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_STATUSES = values('OPEN', 'APPROVED', 'DISMISSED', 'CONVERTED');
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const CONFIDENCE_LEVELS = values('LOW', 'MEDIUM', 'HIGH');
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const ACTION_STATUSES = values(
  'BACKLOG',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'EVALUATED',
  'CANCELLED',
);
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_PRIORITIES = values('LOW', 'MEDIUM', 'HIGH', 'URGENT');
export type ActionPriority = (typeof ACTION_PRIORITIES)[number];

export const RESULT_CLASSIFICATIONS = values('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'INCONCLUSIVE');
export type ResultClassification = (typeof RESULT_CLASSIFICATIONS)[number];

export const TARGET_METRICS = values('CPA', 'ROAS', 'CTR', 'CONVERSION_RATE', 'SPEND_PACING_TOLERANCE');
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const TARGET_SCOPES = values('ORGANIZATION', 'AD_ACCOUNT', 'CAMPAIGN');
export type TargetScope = (typeof TARGET_SCOPES)[number];

export const REPORT_FREQUENCIES = values('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];

export const REPORT_FORMATS = values('PDF', 'EXCEL');
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_STATUSES = values('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const SYNC_TYPES = values('INITIAL', 'INCREMENTAL', 'MANUAL');
export type SyncType = (typeof SYNC_TYPES)[number];

export const SYNC_STATUSES = values('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SUPPORTED_CURRENCIES = values(
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'INR',
  'JPY',
  'CHF',
  'SEK',
  'NZD',
  'SGD',
  'BRL',
  'MXN',
);
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Metrics an optimization action can be monitored against. */
export const MONITORED_METRICS = values(
  'impressions',
  'clicks',
  'cost',
  'conversions',
  'conversionValue',
  'ctr',
  'cpc',
  'cpm',
  'conversionRate',
  'cpa',
  'roas',
);
export type MonitoredMetric = (typeof MONITORED_METRICS)[number];

export const SEARCH_TERM_FLAGS = values('NEGATIVE_CANDIDATE', 'EXPENSIVE', 'HIGH_PERFORMER');
export type SearchTermFlag = (typeof SEARCH_TERM_FLAGS)[number];
