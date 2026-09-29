import { dailySummaryEmail, MetricsRepository, planSyncJobs } from '@adpulse/core';
import type { Prisma } from '@adpulse/database';
import { dbDate } from '@adpulse/database';
import {
  addDays,
  compareKpis,
  formatChangePercent,
  formatCurrency,
  formatNumber,
  formatRatio,
  toKpiValues,
} from '@adpulse/kpi';
import {
  DEFAULT_REPORTING_PREFERENCES,
  type DateRange,
  type ReportFrequency,
  type ReportingPreferences,
} from '@adpulse/types';
import type { WorkerContext } from '../context';
import { dueWork, type ScheduledReportState } from './schedule';

const SUMMARY_ROLES = ['ORGANIZATION_ADMIN', 'MARKETING_MANAGER'] as const;

export interface TickResult {
  organizations: number;
  syncs: number;
  summaries: number;
  reports: number;
}

/** Hourly scheduler: morning sync, daily summary, weekly (Monday) and monthly (1st) reports per org timezone. */
export async function runScheduleTick(ctx: WorkerContext, now = new Date()): Promise<TickResult> {
  const orgs = await ctx.db.organization.findMany({
    where: { deletedAt: null, adAccounts: { some: { isActive: true, isManager: false } } },
  });
  const result: TickResult = { organizations: orgs.length, syncs: 0, summaries: 0, reports: 0 };

  for (const org of orgs) {
    const preferences: ReportingPreferences = {
      ...DEFAULT_REPORTING_PREFERENCES,
      ...(org.reportingPreferences as Partial<ReportingPreferences>),
    };
    const lastReport = (org.lastScheduledReport ?? {}) as ScheduledReportState;
    const due = dueWork(
      {
        timezone: org.timezone,
        lastScheduledSyncDate: org.lastScheduledSyncDate,
        lastScheduledReport: lastReport,
        preferences,
      },
      { syncHour: ctx.env.SYNC_LOCAL_HOUR, reportHour: ctx.env.REPORT_LOCAL_HOUR },
      now,
    );
    const log = ctx.logger.child({ organizationId: org.id, localDate: due.localDate });

    try {
      if (
        due.sync &&
        (await claim(ctx, org.id, { lastScheduledSyncDate: due.localDate }, org.lastScheduledSyncDate))
      ) {
        const { jobs } = await planSyncJobs(ctx.db, {
          organizationId: org.id,
          type: 'INCREMENTAL',
          idempotencyKey: `schedule-${due.localDate}`,
          lookbackDays: ctx.env.SYNC_LOOKBACK_DAYS,
          initialDays: ctx.env.INITIAL_SYNC_DAYS,
          now,
        });
        for (const job of jobs.filter((j) => j.status === 'QUEUED')) {
          await ctx.queues.enqueueAdsSync({ syncJobId: job.id, organizationId: org.id });
        }
        result.syncs += jobs.length;
        log.info({ jobs: jobs.length }, 'Scheduled morning sync');
      }

      const reportState: ScheduledReportState = { ...lastReport };
      if (due.dailySummary) {
        await sendDailySummary(ctx, org.id, org.name, org.currencyCode, due.dailySummary);
        reportState.daily = due.localDate;
        result.summaries += 1;
      }
      for (const [frequency, period, key] of [
        ['WEEKLY', due.weeklyReport, 'weekly'],
        ['MONTHLY', due.monthlyReport, 'monthly'],
      ] as const) {
        if (!period) continue;
        result.reports += await queueScheduledReports(ctx, org.id, frequency, period, due.localDate);
        reportState[key] = due.localDate;
      }
      if (JSON.stringify(reportState) !== JSON.stringify(lastReport)) {
        await ctx.db.organization.update({
          where: { id: org.id },
          data: { lastScheduledReport: reportState as unknown as Prisma.InputJsonValue },
        });
      }
    } catch (error) {
      log.error({ err: error }, 'Scheduled work failed for organization');
    }
  }
  return result;
}

/** Compare-and-set on the marker so concurrent ticks (multiple worker replicas) run the work once. */
async function claim(
  ctx: WorkerContext,
  organizationId: string,
  data: { lastScheduledSyncDate: string },
  previous: string | null,
): Promise<boolean> {
  const { count } = await ctx.db.organization.updateMany({
    where: { id: organizationId, lastScheduledSyncDate: previous },
    data,
  });
  return count === 1;
}

async function sendDailySummary(
  ctx: WorkerContext,
  organizationId: string,
  name: string,
  currency: string,
  day: DateRange,
) {
  const metrics = new MetricsRepository(ctx.db);
  const previousDay = { from: addDays(day.from, -1), to: addDays(day.from, -1) };
  const [current, previous, openCritical, members] = await Promise.all([
    metrics.totals({ organizationId }, day),
    metrics.totals({ organizationId }, previousDay),
    ctx.db.alert.count({ where: { organizationId, status: 'OPEN', severity: 'CRITICAL' } }),
    ctx.db.organizationMembership.findMany({
      where: { organizationId, role: { in: [...SUMMARY_ROLES] }, user: { deletedAt: null } },
      include: { user: { select: { email: true } } },
    }),
  ]);
  const k = toKpiValues(current);
  const changes = compareKpis(k, toKpiValues(previous));
  const change = (key: 'cost' | 'conversions' | 'cpa' | 'roas') => formatChangePercent(changes[key].percent);
  const lines = [
    `Performance for ${day.from}:`,
    `Spend ${formatCurrency(k.cost, { currency })} (${change('cost')} vs previous day)`,
    `Conversions ${formatNumber(k.conversions, { decimals: 1 })} (${change('conversions')})`,
    `CPA ${formatCurrency(k.cpa, { currency })} (${change('cpa')}) · ROAS ${formatRatio(k.roas)} (${change('roas')})`,
    `${openCritical} open critical alert${openCritical === 1 ? '' : 's'}.`,
  ];
  for (const m of members) {
    const message = dailySummaryEmail(m.user.email, name, lines, `${ctx.env.WEB_URL}/dashboard`);
    await ctx.queues.enqueueEmail(message);
  }
}

async function queueScheduledReports(
  ctx: WorkerContext,
  organizationId: string,
  frequency: Extract<ReportFrequency, 'WEEKLY' | 'MONTHLY'>,
  period: DateRange,
  localDate: string,
): Promise<number> {
  const templates = await ctx.db.reportTemplate.findMany({
    where: { organizationId, frequency, scheduleEnabled: true },
  });
  let queued = 0;
  for (const template of templates) {
    const idempotencyKey = `schedule-${frequency}-${template.id}-${localDate}`;
    const report = await ctx.db.generatedReport.upsert({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      update: {},
      create: {
        organizationId,
        templateId: template.id,
        title: `${template.name} · ${period.from} – ${period.to}`,
        frequency,
        format: 'PDF',
        periodStart: dbDate(period.from),
        periodEnd: dbDate(period.to),
        idempotencyKey,
      },
    });
    if (report.status === 'QUEUED') {
      await ctx.queues.enqueueReport({ reportId: report.id, organizationId }, report.format);
      queued += 1;
    }
  }
  return queued;
}
