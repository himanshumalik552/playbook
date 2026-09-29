export const QUEUES = {
  SYNC: 'adpulse-sync',
  ANALYTICS: 'adpulse-analytics',
  REPORTS: 'adpulse-reports',
  EMAIL: 'adpulse-email',
  MAINTENANCE: 'adpulse-maintenance',
  DEAD_LETTER: 'adpulse-dead-letter',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOBS = {
  ADS_SYNC: 'ads-sync',
  ANALYTICS_SYNC: 'analytics-sync',
  AGGREGATE_METRICS: 'aggregate-metrics',
  EVALUATE_ALERTS: 'evaluate-alerts',
  GENERATE_RECOMMENDATIONS: 'generate-recommendations',
  GENERATE_PDF: 'generate-pdf',
  GENERATE_EXCEL: 'generate-excel',
  SEND_EMAIL: 'send-email',
  DATA_CLEANUP: 'data-cleanup',
  SCHEDULE_TICK: 'schedule-tick',
  DEAD_LETTER: 'dead-letter',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export interface SyncJobPayload {
  syncJobId: string;
  organizationId: string;
}

export interface OrganizationJobPayload {
  organizationId: string;
  adAccountId?: string;
  trigger: 'sync' | 'manual' | 'schedule';
}

export interface ReportJobPayload {
  reportId: string;
  organizationId: string;
}

export interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface DeadLetterPayload {
  queue: string;
  jobName: string;
  jobId: string | undefined;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
}
