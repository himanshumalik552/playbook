import {
  JOBS,
  QUEUES,
  type EmailJobPayload,
  type OrganizationJobPayload,
  type QueueName,
  type ReportJobPayload,
  type SyncJobPayload,
} from '@adpulse/config';
import { type JobsOptions, Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 24 * 3600, count: 2000 },
  removeOnFail: { age: 14 * 24 * 3600 },
};

export function createRedisConnection(url: string, options: { lazy?: boolean } = {}): Redis {
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: options.lazy ?? false,
  });
}

/** BullMQ job ids may not contain ':'; keep them deterministic so duplicate enqueues are ignored. */
export const jobId = (...parts: string[]) => parts.join('_').replace(/[^a-zA-Z0-9_-]/g, '-');

export class JobQueues {
  readonly queues: Record<QueueName, Queue>;

  constructor(private readonly connection: Redis) {
    const make = (name: QueueName) => new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    this.queues = {
      [QUEUES.SYNC]: make(QUEUES.SYNC),
      [QUEUES.ANALYTICS]: make(QUEUES.ANALYTICS),
      [QUEUES.REPORTS]: make(QUEUES.REPORTS),
      [QUEUES.EMAIL]: make(QUEUES.EMAIL),
      [QUEUES.MAINTENANCE]: make(QUEUES.MAINTENANCE),
      [QUEUES.DEAD_LETTER]: make(QUEUES.DEAD_LETTER),
    };
  }

  get(name: QueueName): Queue {
    return this.queues[name];
  }

  async enqueueAdsSync(payload: SyncJobPayload): Promise<void> {
    await this.queues[QUEUES.SYNC].add(JOBS.ADS_SYNC, payload, {
      jobId: jobId('ads', payload.syncJobId),
      attempts: 5,
    });
  }

  async enqueueAnalyticsSync(payload: SyncJobPayload): Promise<void> {
    await this.queues[QUEUES.SYNC].add(JOBS.ANALYTICS_SYNC, payload, {
      jobId: jobId('ga4', payload.syncJobId),
    });
  }

  /**
   * Post-sync analytics pipeline. Deduplicated per organization within a short window so a burst of
   * account syncs triggers one evaluation.
   */
  async enqueueAnalytics(
    name: typeof JOBS.AGGREGATE_METRICS | typeof JOBS.EVALUATE_ALERTS | typeof JOBS.GENERATE_RECOMMENDATIONS,
    payload: OrganizationJobPayload,
    dedupeWindowMs = 60_000,
  ): Promise<void> {
    const bucket = Math.floor(Date.now() / dedupeWindowMs).toString();
    await this.queues[QUEUES.ANALYTICS].add(name, payload, {
      jobId: jobId(name, payload.organizationId, payload.adAccountId ?? 'all', bucket),
    });
  }

  /** `attempt` distinguishes manual retries, since the failed job keeps its id in the queue history. */
  async enqueueReport(payload: ReportJobPayload, format: 'PDF' | 'EXCEL', attempt?: string): Promise<void> {
    await this.queues[QUEUES.REPORTS].add(
      format === 'PDF' ? JOBS.GENERATE_PDF : JOBS.GENERATE_EXCEL,
      payload,
      {
        jobId: attempt ? jobId('report', payload.reportId, attempt) : jobId('report', payload.reportId),
        attempts: 3,
      },
    );
  }

  async enqueueEmail(payload: EmailJobPayload): Promise<void> {
    await this.queues[QUEUES.EMAIL].add(JOBS.SEND_EMAIL, payload, { attempts: 5 });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.connection.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((q) => q.close()));
  }
}
