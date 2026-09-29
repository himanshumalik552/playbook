import type {
  ActionPriority,
  ActionStatus,
  AlertSeverity,
  AlertStatus,
  CampaignStatus,
  ConfidenceLevel,
  ConnectionStatus,
  RecommendationStatus,
  ReportStatus,
  ResultClassification,
  SyncStatus,
} from '@adpulse/types';
import type { StatusTone } from '@adpulse/ui';

export const SEVERITY_TONE: Record<AlertSeverity, StatusTone> = {
  CRITICAL: 'error',
  WARNING: 'warning',
  INFO: 'info',
};
export const ALERT_STATUS_TONE: Record<AlertStatus, StatusTone> = {
  OPEN: 'error',
  ACKNOWLEDGED: 'warning',
  RESOLVED: 'success',
  DISMISSED: 'neutral',
};
export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, StatusTone> = {
  ENABLED: 'success',
  PAUSED: 'warning',
  REMOVED: 'neutral',
};
export const CONFIDENCE_TONE: Record<ConfidenceLevel, StatusTone> = {
  HIGH: 'success',
  MEDIUM: 'info',
  LOW: 'neutral',
};
export const RECOMMENDATION_STATUS_TONE: Record<RecommendationStatus, StatusTone> = {
  OPEN: 'info',
  APPROVED: 'success',
  DISMISSED: 'neutral',
  CONVERTED: 'primary',
};
export const ACTION_STATUS_TONE: Record<ActionStatus, StatusTone> = {
  BACKLOG: 'neutral',
  PLANNED: 'info',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  EVALUATED: 'success',
  CANCELLED: 'neutral',
};
export const PRIORITY_TONE: Record<ActionPriority, StatusTone> = {
  URGENT: 'error',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};
export const RESULT_TONE: Record<ResultClassification, StatusTone> = {
  POSITIVE: 'success',
  NEUTRAL: 'neutral',
  NEGATIVE: 'error',
  INCONCLUSIVE: 'warning',
};
export const REPORT_STATUS_TONE: Record<ReportStatus, StatusTone> = {
  QUEUED: 'neutral',
  PROCESSING: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
};
export const SYNC_STATUS_TONE: Record<SyncStatus, StatusTone> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  SUCCEEDED: 'success',
  PARTIAL: 'warning',
  FAILED: 'error',
};
export const CONNECTION_STATUS_TONE: Record<ConnectionStatus, StatusTone> = {
  ACTIVE: 'success',
  NEEDS_ATTENTION: 'warning',
  ERROR: 'error',
  REVOKED: 'neutral',
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  BACKLOG: 'Backlog',
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  EVALUATED: 'Evaluated',
  CANCELLED: 'Cancelled',
};
