import { dbDate, fromDbDate, Prisma, type PrismaClient } from '@adpulse/database';
import { addDays, daysInMonth, isoDateInTimezone, startOfMonth, toKpiValues } from '@adpulse/kpi';
import type { AlertType } from '@adpulse/types';
import type { Logger } from '../logger';
import { MetricsRepository } from '../metrics/metrics-repository';
import { loadTargets } from '../targets/targets';
import {
  type AccountSnapshot,
  type AlertCandidate,
  type AlertEvaluationInput,
  type CampaignSnapshot,
  DEFAULT_RULES,
  evaluateAlertRules,
  type RuleConfig,
} from './rules';

const WINDOW_DAYS = 7;
const BASELINE_DAYS = 28;
const RECENT_SERIES_DAYS = 17;
const SUPPRESSION_DAYS = 7;

const decimal = (value: number | null) =>
  value === null || !Number.isFinite(value) ? null : new Prisma.Decimal(value.toFixed(6));

export interface EvaluationResult {
  created: number;
  updated: number;
  resolved: number;
  candidates: AlertCandidate[];
}

export class AlertEvaluationService {
  private readonly metrics: MetricsRepository;

  constructor(
    private readonly db: PrismaClient,
    private readonly logger: Logger,
  ) {
    this.metrics = new MetricsRepository(db);
  }

  async ensureDefaultRules(organizationId: string): Promise<void> {
    await this.db.alertRule.createMany({
      data: (Object.keys(DEFAULT_RULES) as AlertType[]).map((type) => ({
        organizationId,
        type,
        name: DEFAULT_RULES[type].name,
        enabled: DEFAULT_RULES[type].enabled,
        severity: DEFAULT_RULES[type].severity,
        thresholds: DEFAULT_RULES[type].thresholds,
      })),
      skipDuplicates: true,
    });
  }

  async buildInput(organizationId: string, now = new Date()): Promise<AlertEvaluationInput> {
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const today = isoDateInTimezone(now, org.timezone);
    const anchor = (await this.metrics.lastMetricDate(organizationId)) ?? addDays(today, -1);
    const window = { from: addDays(anchor, -(WINDOW_DAYS - 1)), to: anchor };
    const baselineWindow = { from: addDays(window.from, -BASELINE_DAYS), to: addDays(window.from, -1) };
    const filters = { organizationId };

    const [accounts, campaigns, ruleRows, targets, connections] = await Promise.all([
      this.db.adAccount.findMany({ where: { organizationId, isActive: true, isManager: false } }),
      this.db.campaign.findMany({
        where: { organizationId, status: 'ENABLED', adAccount: { isActive: true } },
      }),
      this.db.alertRule.findMany({ where: { organizationId } }),
      loadTargets(this.db, organizationId),
      this.db.oAuthConnection.findMany({ where: { organizationId, status: { not: 'REVOKED' } } }),
    ]);

    const campaignIds = campaigns.map((c) => c.id);
    const [currentRows, baselineRows, shareRows, seriesRows, pageRows] = await Promise.all([
      this.metrics.groupBy(filters, window, 'campaign', { campaignIds }),
      this.metrics.groupBy(filters, baselineWindow, 'campaign', { campaignIds }),
      this.metrics.impressionShare(organizationId, window, campaignIds),
      this.db.campaignDailyMetric.findMany({
        where: {
          organizationId,
          campaignId: { in: campaignIds },
          date: { gte: dbDate(addDays(anchor, -(RECENT_SERIES_DAYS - 1))), lte: dbDate(anchor) },
        },
        select: { campaignId: true, date: true, impressions: true },
        orderBy: { date: 'asc' },
      }),
      this.metrics.landingPageAnalytics(filters, window, null),
    ]);

    const byKey = <T extends { key: string }>(rows: T[]) => new Map(rows.map((r) => [r.key, r]));
    const current = byKey(currentRows);
    const baseline = byKey(baselineRows);
    const shares = byKey(shareRows);
    const series = new Map<string, number[]>();
    for (const row of seriesRows) {
      const list = series.get(row.campaignId) ?? [];
      list.push(row.impressions);
      series.set(row.campaignId, list);
    }
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const empty = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 };

    const campaignSnapshots: CampaignSnapshot[] = campaigns
      .filter((c) => accountById.has(c.adAccountId))
      .map((c) => {
        const lost = shares.get(c.id)?.searchBudgetLostImpressionShare;
        return {
          id: c.id,
          name: c.name,
          adAccountId: c.adAccountId,
          currencyCode: accountById.get(c.adAccountId)?.currencyCode ?? org.currencyCode,
          current: toKpiValues(current.get(c.id) ?? empty),
          baseline: toKpiValues(baseline.get(c.id) ?? empty),
          targets: targets.forEntity({ adAccountId: c.adAccountId, campaignId: c.id }),
          budgetLostImpressionShare: lost ? Number(lost) : null,
          recentImpressions: series.get(c.id) ?? [],
        };
      });

    const pages = await this.db.landingPage.findMany({
      where: { organizationId, id: { in: pageRows.map((p) => p.key) } },
      select: { id: true, url: true },
    });
    const pageUrl = new Map(pages.map((p) => [p.id, p.url]));

    const monthStart = startOfMonth(anchor);
    const accountSnapshots: AccountSnapshot[] = [];
    for (const a of accounts) {
      const [lastDate, recent, mtd] = await Promise.all([
        this.metrics.lastMetricDate(organizationId, a.id),
        this.db.accountDailyMetric.findMany({
          where: {
            adAccountId: a.id,
            date: { gte: dbDate(addDays(anchor, -(RECENT_SERIES_DAYS - 1))), lte: dbDate(anchor) },
          },
          orderBy: { date: 'asc' },
        }),
        this.metrics.totals({ organizationId, adAccountId: a.id }, { from: monthStart, to: anchor }, null),
      ]);
      const dailyBudget = campaigns
        .filter((c) => c.adAccountId === a.id)
        .reduce((sum, c) => sum + Number(c.dailyBudget?.toString() ?? 0), 0);
      const monthDays = daysInMonth(anchor);
      accountSnapshots.push({
        id: a.id,
        name: a.name,
        currencyCode: a.currencyCode,
        lastMetricDate: lastDate,
        recentDaily: recent.map((r) => ({
          date: fromDbDate(r.date),
          clicks: Number(r.clicks),
          conversions: Number(r.conversions.toString()),
        })),
        monthToDateSpend: Number(mtd.cost),
        monthlyPlan: dailyBudget > 0 ? dailyBudget * monthDays : null,
        elapsedDaysInMonth: Number(anchor.slice(8, 10)),
        daysInMonth: monthDays,
        pacingTolerancePercent: targets.get('SPEND_PACING_TOLERANCE', { adAccountId: a.id }),
      });
    }

    const latestSyncs = await this.db.$queryRaw<
      { id: string; adAccountId: string | null; status: string; finishedAt: Date | null }[]
    >`SELECT DISTINCT ON ("adAccountId") "id", "adAccountId", "status"::text AS "status", "finishedAt"
      FROM "SyncJob" WHERE "organizationId" = ${organizationId} AND "status" IN ('SUCCEEDED', 'FAILED', 'PARTIAL')
      ORDER BY "adAccountId", "createdAt" DESC`;
    const syncErrors = await this.db.syncError.findMany({
      where: { syncJobId: { in: latestSyncs.map((s) => s.id) } },
      orderBy: { createdAt: 'desc' },
    });

    const rules: Partial<Record<AlertType, RuleConfig>> = {};
    for (const r of ruleRows) {
      rules[r.type] = {
        enabled: r.enabled,
        severity: r.severity,
        thresholds: r.thresholds as Record<string, number>,
      };
    }

    return {
      today,
      window,
      baselineWindow,
      campaigns: campaignSnapshots,
      landingPages: pageRows.map((p) => ({
        id: p.key,
        url: pageUrl.get(p.key) ?? p.key,
        adAccountId: null,
        sessions: p.sessions === null ? null : Number(p.sessions),
        engagedSessions: p.engagedSessions === null ? null : Number(p.engagedSessions),
      })),
      accounts: accountSnapshots,
      connections: connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        lastError: c.lastError,
      })),
      latestSyncs: latestSyncs.map((s) => ({
        id: s.id,
        adAccountId: s.adAccountId,
        adAccountName: s.adAccountId ? (accountById.get(s.adAccountId)?.name ?? null) : null,
        status: s.status,
        errorMessage: syncErrors.find((e) => e.syncJobId === s.id)?.message ?? null,
        finishedAt: s.finishedAt?.toISOString() ?? null,
      })),
      rules,
    };
  }

  /** Evaluates all rules and reconciles alerts: update active matches, create new ones, auto-resolve cleared ones. */
  async evaluate(organizationId: string, now = new Date()): Promise<EvaluationResult> {
    await this.ensureDefaultRules(organizationId);
    const input = await this.buildInput(organizationId, now);
    const candidates = evaluateAlertRules(input);
    const ruleIds = new Map(
      (await this.db.alertRule.findMany({ where: { organizationId }, select: { id: true, type: true } })).map(
        (r) => [r.type, r.id],
      ),
    );

    const existing = await this.db.alert.findMany({
      where: {
        organizationId,
        OR: [
          { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
          {
            status: { in: ['DISMISSED', 'RESOLVED'] },
            updatedAt: { gte: new Date(now.getTime() - SUPPRESSION_DAYS * 86_400_000) },
          },
        ],
      },
      select: { id: true, fingerprint: true, status: true },
    });
    const active = new Map(
      existing
        .filter((a) => a.status === 'OPEN' || a.status === 'ACKNOWLEDGED')
        .map((a) => [a.fingerprint, a]),
    );
    const suppressed = new Set(existing.filter((a) => a.status === 'DISMISSED').map((a) => a.fingerprint));

    let created = 0;
    let updated = 0;
    for (const c of candidates) {
      const values = {
        severity: c.severity,
        metric: c.metric,
        currentValue: decimal(c.currentValue),
        baselineValue: decimal(c.baselineValue),
        difference: decimal(c.difference),
        differencePercent: decimal(c.differencePercent),
        windowStart: dbDate(c.windowStart),
        windowEnd: dbDate(c.windowEnd),
        explanation: c.explanation,
        suggestedInvestigation: c.suggestedInvestigation,
        entityName: c.entityName,
        lastDetectedAt: now,
      };
      const match = active.get(c.fingerprint);
      if (match) {
        await this.db.alert.update({ where: { id: match.id }, data: values });
        updated += 1;
      } else if (!suppressed.has(c.fingerprint)) {
        await this.db.alert.create({
          data: {
            ...values,
            organizationId,
            type: c.type,
            ruleId: ruleIds.get(c.type) ?? null,
            adAccountId: c.adAccountId,
            campaignId: c.campaignId,
            entityType: c.entityType,
            entityId: c.entityId,
            fingerprint: c.fingerprint,
          },
        });
        created += 1;
      }
    }

    const detected = new Set(candidates.map((c) => c.fingerprint));
    const cleared = [...active.values()].filter((a) => !detected.has(a.fingerprint)).map((a) => a.id);
    if (cleared.length > 0) {
      await this.db.alert.updateMany({
        where: { id: { in: cleared }, organizationId },
        data: {
          status: 'RESOLVED',
          resolvedAt: now,
          resolutionNote: 'Condition no longer detected by automated evaluation.',
        },
      });
    }

    this.logger.info(
      { organizationId, created, updated, resolved: cleared.length },
      'Alert evaluation completed',
    );
    return { created, updated, resolved: cleared.length, candidates };
  }
}
