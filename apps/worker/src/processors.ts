import {
  JOBS,
  type EmailJobPayload,
  type OrganizationJobPayload,
  type ReportJobPayload,
  type SyncJobPayload,
} from '@adpulse/config';
import { isRetryableError, redactSecrets, reportReadyEmail } from '@adpulse/core';
import { fromDbDate } from '@adpulse/database';
import { addDays, isoDateInTimezone } from '@adpulse/kpi';
import { type Job, UnrecoverableError } from 'bullmq';
import type { WorkerContext } from './context';
import { runScheduleTick } from './scheduler/tick';

export const isFinalAttempt = (job: Job) => job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

/** Non-retryable failures skip remaining BullMQ attempts so they reach the dead-letter queue immediately. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isRetryableError(error)) {
      throw new UnrecoverableError(redactSecrets(error instanceof Error ? error.message : String(error)));
    }
    throw error;
  }
}

export function syncProcessor(ctx: WorkerContext) {
  return async (job: Job<SyncJobPayload>) => {
    const record = await ctx.db.syncJob.findUnique({ where: { id: job.data.syncJobId } });
    if (!record || record.organizationId !== job.data.organizationId) {
      throw new UnrecoverableError(`Sync job ${job.data.syncJobId} not found for organization`);
    }
    const range = { from: fromDbDate(record.rangeStart), to: fromDbDate(record.rangeEnd) };

    if (job.name === JOBS.ADS_SYNC) {
      const result = await guard(() =>
        ctx.sync.runAdsSync(record.id, {
          isFinalAttempt: isFinalAttempt(job),
          onProgress: (percent) => job.updateProgress(percent),
        }),
      );
      await ctx.queues.enqueueAnalyticsSync(job.data);
      return result;
    }

    // Alerts and recommendations run after the GA4 join so landing-page rules see session data.
    const adAccountId = record.adAccountId;
    const joined = adAccountId
      ? await guard(() => ctx.sync.runAnalyticsSync(record.organizationId, adAccountId, range))
      : 0;
    const followUp: OrganizationJobPayload = { organizationId: record.organizationId, trigger: 'sync' };
    await ctx.queues.enqueueAnalytics(JOBS.EVALUATE_ALERTS, followUp);
    await ctx.queues.enqueueAnalytics(JOBS.GENERATE_RECOMMENDATIONS, followUp);
    return { joined };
  };
}

export function analyticsProcessor(ctx: WorkerContext) {
  return async (job: Job<OrganizationJobPayload>) => {
    const { organizationId } = job.data;
    switch (job.name) {
      case JOBS.EVALUATE_ALERTS: {
        const { created, updated, resolved } = await ctx.alerts.evaluate(organizationId);
        return { created, updated, resolved };
      }
      case JOBS.GENERATE_RECOMMENDATIONS: {
        const { created, updated } = await ctx.recommendations.generate(organizationId);
        return { created, updated };
      }
      case JOBS.AGGREGATE_METRICS: {
        const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: organizationId } });
        const to = isoDateInTimezone(new Date(), org.timezone);
        const rows = await ctx.sync.aggregateAccountMetrics(organizationId, job.data.adAccountId, {
          from: addDays(to, -ctx.env.INITIAL_SYNC_DAYS),
          to,
        });
        return { rows };
      }
      default:
        throw new UnrecoverableError(`Unknown analytics job ${job.name}`);
    }
  };
}

export function reportProcessor(ctx: WorkerContext) {
  return async (job: Job<ReportJobPayload>) => {
    const report = await ctx.db.generatedReport.findUnique({
      where: { id: job.data.reportId },
      include: { template: true },
    });
    if (!report || report.organizationId !== job.data.organizationId) {
      throw new UnrecoverableError(`Report ${job.data.reportId} not found for organization`);
    }
    await job.updateProgress(10);
    const result = await ctx.reports.run(report.id, { isFinalAttempt: isFinalAttempt(job) });
    await job.updateProgress(90);
    for (const to of report.template?.recipients ?? []) {
      await ctx.queues.enqueueEmail(reportReadyEmail(to, report.title, `${ctx.env.WEB_URL}/reports`));
    }
    return result;
  };
}

export function emailProcessor(ctx: WorkerContext) {
  return async (job: Job<EmailJobPayload>) => {
    await ctx.email.send(job.data);
    return { sent: true };
  };
}

export function maintenanceProcessor(ctx: WorkerContext) {
  return async (job: Job) => {
    if (job.name === JOBS.SCHEDULE_TICK) {
      if (!ctx.env.SCHEDULER_ENABLED) return { skipped: true };
      return runScheduleTick(ctx);
    }
    if (job.name === JOBS.DATA_CLEANUP) return ctx.cleanup.run();
    throw new UnrecoverableError(`Unknown maintenance job ${job.name}`);
  };
}
