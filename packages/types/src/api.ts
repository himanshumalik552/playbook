import type {
  ActionPriority,
  ActionStatus,
  AlertSeverity,
  AlertStatus,
  AlertType,
  CampaignObjective,
  CampaignStatus,
  ConfidenceLevel,
  ConnectionStatus,
  Device,
  EntityType,
  IntegrationProvider,
  MatchType,
  OrgRole,
  RecommendationStatus,
  RecommendationType,
  ReportFormat,
  ReportFrequency,
  ReportStatus,
  ResultClassification,
  SyncStatus,
  SyncType,
  SystemRole,
  TargetMetric,
  TargetScope,
} from './enums';
import type { Permission } from './permissions';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
  requestId?: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export type SortDirection = 'asc' | 'desc';

/* ----------------------------- Auth / users ----------------------------- */

export interface MembershipSummary {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
  onboardingCompleted: boolean;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  systemRole: SystemRole;
  hasPassword: boolean;
  memberships: MembershipSummary[];
  featureFlags: Record<string, boolean>;
}

export interface OrganizationContext {
  id: string;
  name: string;
  role: OrgRole;
  permissions: Permission[];
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

/* ----------------------------- Organization ----------------------------- */

export interface ReportingPreferences {
  defaultDateRangeDays: number;
  weekStartsOn: 0 | 1;
  compareByDefault: boolean;
  weeklyReportEnabled: boolean;
  monthlyReportEnabled: boolean;
  dailySummaryEnabled: boolean;
}

export interface BrandingSettings {
  primaryColor: string;
  logoUrl: string | null;
  reportFooter: string | null;
}

export interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  currencyCode: string;
  timezone: string;
  reportingPreferences: ReportingPreferences;
  branding: BrandingSettings;
  dataRetentionDays: number;
  onboardingStep: number;
  onboardingCompletedAt: string | null;
  createdAt: string;
}

export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
  lastLoginAt: string | null;
}

export interface InvitationDto {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
}

/* ----------------------------- Integrations ----------------------------- */

export interface IntegrationConnectionDto {
  id: string;
  provider: IntegrationProvider;
  status: ConnectionStatus;
  isMock: boolean;
  externalEmail: string | null;
  scopes: string[];
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  connectedAt: string;
}

export interface IntegrationOverviewDto {
  mode: 'mock' | 'google';
  googleConfigured: boolean;
  connections: IntegrationConnectionDto[];
}

export interface AdAccountDto {
  id: string;
  customerId: string;
  managerCustomerId: string | null;
  name: string;
  currencyCode: string;
  timezone: string;
  isManager: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
}

export interface AccessibleCustomerDto {
  customerId: string;
  name: string;
  currencyCode: string;
  timezone: string;
  isManager: boolean;
  managerCustomerId: string | null;
}

export interface AnalyticsPropertyDto {
  id: string;
  propertyId: string;
  name: string;
  timezone: string;
  adAccountId: string | null;
}

/* ----------------------------- Metrics ----------------------------- */

export interface MetricTotals {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
}

export interface KpiValues extends MetricTotals {
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  conversionRate: number | null;
  cpa: number | null;
  roas: number | null;
}

export type KpiKey = keyof KpiValues;

export interface MetricChange {
  absolute: number | null;
  percent: number | null;
  isImprovement: boolean | null;
}

export interface KpiComparison {
  current: KpiValues;
  previous: KpiValues | null;
  change: Partial<Record<KpiKey, MetricChange>> | null;
}

export interface DailyPoint extends KpiValues {
  date: string;
}

export interface DashboardFilters {
  from: string;
  to: string;
  compare: boolean;
  adAccountId?: string;
  campaignIds?: string[];
  device?: Device;
  locationId?: string;
  objective?: CampaignObjective;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface DashboardOverviewDto {
  range: DateRange;
  previousRange: DateRange | null;
  currencyCode: string;
  timezone: string;
  kpis: KpiComparison;
  trend: DailyPoint[];
  previousTrend: DailyPoint[] | null;
  dataFreshness: DataFreshnessDto;
  source: 'campaign' | 'device' | 'location' | 'account';
}

export interface DataFreshnessDto {
  lastMetricDate: string | null;
  lastSuccessfulSyncAt: string | null;
  isStale: boolean;
}

export interface DashboardSummaryDto {
  alerts: { open: number; critical: number; warning: number; info: number; latest: AlertDto[] };
  recommendations: { open: number; latest: RecommendationDto[] };
  recentActions: ActionListItemDto[];
  sync: SyncJobDto | null;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOptionsDto {
  adAccounts: FilterOption[];
  campaigns: (FilterOption & { adAccountId: string; objective: CampaignObjective })[];
  devices: FilterOption[];
  locations: FilterOption[];
  objectives: FilterOption[];
}

/* ----------------------------- Entities ----------------------------- */

export interface CampaignRowDto {
  id: string;
  externalId: string;
  name: string;
  adAccountId: string;
  adAccountName: string;
  status: CampaignStatus;
  objective: CampaignObjective;
  channelType: string;
  dailyBudget: number | null;
  currencyCode: string;
  current: KpiValues;
  previous: KpiValues | null;
  openAlerts: number;
}

export interface CampaignDetailDto extends CampaignRowDto {
  startDate: string | null;
  searchImpressionShare: number | null;
  searchTopImpressionShare: number | null;
  searchAbsoluteTopImpressionShare: number | null;
  searchBudgetLostImpressionShare: number | null;
  targets: Partial<Record<TargetMetric, number>>;
  trend: DailyPoint[];
  change: Partial<Record<KpiKey, MetricChange>> | null;
}

export interface AdGroupRowDto {
  id: string;
  name: string;
  status: CampaignStatus;
  campaignId: string;
  campaignName: string;
  metrics: KpiValues;
}

export interface KeywordRowDto {
  id: string;
  text: string;
  matchType: MatchType;
  status: CampaignStatus;
  qualityScore: number | null;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  metrics: KpiValues;
}

export interface SearchTermRowDto {
  id: string;
  term: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  keywordText: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  metrics: KpiValues;
  recommendationReason: string | null;
  flag: 'NEGATIVE_CANDIDATE' | 'EXPENSIVE' | 'HIGH_PERFORMER' | null;
}

export interface DimensionRowDto {
  key: string;
  label: string;
  metrics: KpiValues;
}

export interface LandingPageRowDto {
  id: string;
  url: string;
  metrics: KpiValues;
  sessions: number | null;
  engagedSessions: number | null;
  engagementRate: number | null;
  bounceRate: number | null;
  analyticsConversions: number | null;
  analyticsJoined: boolean;
}

export interface ChangeLogDto {
  id: string;
  entityType: EntityType;
  entityId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  source: 'USER' | 'SYNC' | 'SYSTEM';
  changedBy: string | null;
  createdAt: string;
}

/* ----------------------------- Targets & rules ----------------------------- */

export interface TargetDto {
  id: string;
  scope: TargetScope;
  metric: TargetMetric;
  value: number;
  adAccountId: string | null;
  adAccountName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AlertRuleDto {
  id: string;
  type: AlertType;
  name: string;
  description: string;
  enabled: boolean;
  severity: AlertSeverity;
  thresholds: Record<string, number>;
  updatedAt: string;
}

/* ----------------------------- Alerts / recommendations ----------------------------- */

export interface UserRef {
  id: string;
  name: string;
}

export interface AlertDto {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  adAccountId: string | null;
  adAccountName: string | null;
  entityType: EntityType;
  entityId: string | null;
  entityName: string | null;
  campaignId: string | null;
  metric: string;
  currentValue: number | null;
  baselineValue: number | null;
  difference: number | null;
  differencePercent: number | null;
  windowStart: string;
  windowEnd: string;
  explanation: string;
  suggestedInvestigation: string;
  assignee: UserRef | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationEvidenceItem {
  label: string;
  value: string;
}

export interface RecommendationDto {
  id: string;
  type: RecommendationType;
  title: string;
  rationale: string;
  evidence: RecommendationEvidenceItem[];
  affectedMetrics: string[];
  confidence: ConfidenceLevel;
  status: RecommendationStatus;
  adAccountId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  entityType: EntityType;
  entityId: string | null;
  entityName: string | null;
  dismissalReason: string | null;
  decidedBy: UserRef | null;
  decidedAt: string | null;
  actionId: string | null;
  createdAt: string;
}

/* ----------------------------- Actions ----------------------------- */

export interface ActionListItemDto {
  id: string;
  title: string;
  status: ActionStatus;
  priority: ActionPriority;
  owner: UserRef | null;
  campaignId: string | null;
  campaignName: string | null;
  metricToMonitor: string | null;
  plannedDate: string | null;
  completedAt: string | null;
  evaluationDate: string | null;
  resultClassification: ResultClassification | null;
  updatedAt: string;
}

export interface ActionAttachment {
  name: string;
  url: string;
}

export interface ActionCommentDto {
  id: string;
  body: string;
  author: UserRef;
  createdAt: string;
}

export interface ActionDetailDto extends ActionListItemDto {
  description: string | null;
  hypothesis: string | null;
  expectedImpact: string | null;
  adAccountId: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  actualValue: number | null;
  actualResult: string | null;
  cancellationReason: string | null;
  alertId: string | null;
  recommendationId: string | null;
  attachments: ActionAttachment[];
  comments: ActionCommentDto[];
  history: ChangeLogDto[];
  createdBy: UserRef | null;
  createdAt: string;
}

/* ----------------------------- Reports ----------------------------- */

export interface ReportTemplateDto {
  id: string;
  name: string;
  frequency: ReportFrequency;
  description: string | null;
  isDefault: boolean;
  scheduleEnabled: boolean;
  sections: string[];
  recipients: string[];
}

export interface GeneratedReportDto {
  id: string;
  title: string;
  format: ReportFormat;
  status: ReportStatus;
  frequency: ReportFrequency;
  periodStart: string;
  periodEnd: string;
  fileSize: number | null;
  error: string | null;
  requestedBy: UserRef | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ReportCampaignRow {
  id: string;
  name: string;
  accountName: string;
  objective: string;
  status: string;
  current: KpiValues;
  previous: KpiValues;
  note: string | null;
}

/** Report content shared by the preview endpoint and the PDF/Excel renderers. */
export interface ReportData {
  title: string;
  organizationName: string;
  currencyCode: string;
  timezone: string;
  branding: BrandingSettings;
  frequency: ReportFrequency;
  period: DateRange;
  previousPeriod: DateRange;
  filters: { adAccount: string | null; campaigns: string[] };
  kpis: KpiComparison;
  targets: {
    metric: TargetMetric;
    label: string;
    target: number;
    actual: number | null;
    met: boolean | null;
    deviation: number | null;
  }[];
  trend: DailyPoint[];
  topCampaigns: ReportCampaignRow[];
  underperformingCampaigns: ReportCampaignRow[];
  campaigns: ReportCampaignRow[];
  keywords: {
    text: string;
    campaign: string;
    matchType: string;
    qualityScore: number | null;
    metrics: KpiValues;
  }[];
  searchTerms: {
    term: string;
    campaign: string;
    flag: string | null;
    reason: string | null;
    metrics: KpiValues;
  }[];
  landingPages: {
    url: string;
    metrics: KpiValues;
    sessions: number | null;
    bounceRate: number | null;
    joined: boolean;
  }[];
  alerts: {
    severity: string;
    type: string;
    entity: string | null;
    explanation: string;
    status: string;
    createdAt: string;
  }[];
  completedActions: {
    title: string;
    status: string;
    owner: string | null;
    completedAt: string | null;
    result: string | null;
    classification: string | null;
  }[];
  risks: string[];
  nextActions: string[];
  dataFreshness: { lastMetricDate: string | null; lastSyncAt: string | null; note: string };
  commentary: string;
  generatedAt: string;
}

/* ----------------------------- Sync / audit / admin ----------------------------- */

export interface SyncJobDto {
  id: string;
  provider: IntegrationProvider;
  type: SyncType;
  status: SyncStatus;
  adAccountId: string | null;
  adAccountName: string | null;
  rangeStart: string;
  rangeEnd: string;
  rowsProcessed: number;
  progress: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errors: { code: string; message: string; createdAt: string }[];
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actor: UserRef | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface FeatureFlagDto {
  id: string;
  key: string;
  description: string | null;
  enabled: boolean;
  organizationIds: string[];
  updatedAt: string;
}

export interface QueueHealthDto {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface FailedJobDto {
  id: string;
  queue: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface SystemHealthDto {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  database: 'up' | 'down';
  redis: 'up' | 'down';
  version: string;
  integrationMode: 'mock' | 'google';
  counts: { organizations: number; users: number; campaigns: number; metricRows: number; openAlerts: number };
  memory: { rssMb: number; heapUsedMb: number };
}

export interface AdminOrganizationDto {
  id: string;
  name: string;
  slug: string;
  members: number;
  adAccounts: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  organizations: number;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
}
