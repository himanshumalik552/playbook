import { deviationFromTarget, formatCurrency, formatPercent, formatRatio, safeDivide } from '@adpulse/kpi';
import type { AlertSeverity, AlertType, EntityType, KpiValues, TargetMetric } from '@adpulse/types';

export interface RuleConfig {
  enabled: boolean;
  severity: AlertSeverity;
  thresholds: Record<string, number>;
}

export interface CampaignSnapshot {
  id: string;
  name: string;
  adAccountId: string;
  currencyCode: string;
  current: KpiValues;
  baseline: KpiValues;
  targets: Record<TargetMetric, number>;
  budgetLostImpressionShare: number | null;
  /** Daily impressions for the last N days, oldest first. */
  recentImpressions: number[];
}

export interface LandingPageSnapshot {
  id: string;
  url: string;
  adAccountId: string | null;
  sessions: number | null;
  engagedSessions: number | null;
}

export interface AccountSnapshot {
  id: string;
  name: string;
  currencyCode: string;
  lastMetricDate: string | null;
  /** Daily clicks/conversions for the recent period, oldest first. */
  recentDaily: { date: string; clicks: number; conversions: number }[];
  monthToDateSpend: number;
  monthlyPlan: number | null;
  elapsedDaysInMonth: number;
  daysInMonth: number;
  pacingTolerancePercent: number;
}

export interface ConnectionSnapshot {
  id: string;
  provider: string;
  status: string;
  lastError: string | null;
}

export interface SyncSnapshot {
  id: string;
  adAccountId: string | null;
  adAccountName: string | null;
  status: string;
  errorMessage: string | null;
  finishedAt: string | null;
}

export interface AlertEvaluationInput {
  today: string;
  window: { from: string; to: string };
  baselineWindow: { from: string; to: string };
  campaigns: CampaignSnapshot[];
  landingPages: LandingPageSnapshot[];
  accounts: AccountSnapshot[];
  connections: ConnectionSnapshot[];
  latestSyncs: SyncSnapshot[];
  rules: Partial<Record<AlertType, RuleConfig>>;
}

export interface AlertCandidate {
  type: AlertType;
  severity: AlertSeverity;
  entityType: EntityType;
  entityId: string | null;
  entityName: string | null;
  adAccountId: string | null;
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
  fingerprint: string;
}

export const DEFAULT_RULES: Record<AlertType, RuleConfig & { name: string; description: string }> = {
  HIGH_SPEND_ZERO_CONVERSIONS: {
    name: 'High spend with zero conversions',
    description: 'Campaign spent at least the minimum amount in the window without recording a conversion.',
    enabled: true,
    severity: 'CRITICAL',
    thresholds: { minSpend: 150 },
  },
  CPA_ABOVE_TARGET: {
    name: 'CPA above target',
    description: 'Cost per acquisition exceeds the effective CPA target by more than the tolerance.',
    enabled: true,
    severity: 'WARNING',
    thresholds: { tolerancePercent: 15, criticalPercent: 50, minConversions: 3 },
  },
  ROAS_BELOW_TARGET: {
    name: 'ROAS below target',
    description: 'Return on ad spend falls short of the ROAS target by more than the tolerance.',
    enabled: true,
    severity: 'WARNING',
    thresholds: { tolerancePercent: 15, criticalPercent: 40, minSpend: 100 },
  },
  CTR_BELOW_TARGET: {
    name: 'CTR below target',
    description:
      'Click-through rate is below the configured CTR threshold with meaningful impression volume.',
    enabled: true,
    severity: 'INFO',
    thresholds: { tolerancePercent: 10, minImpressions: 5000 },
  },
  CPC_INCREASE: {
    name: 'CPC increase',
    description: 'Average CPC increased more than the threshold compared with the baseline period.',
    enabled: true,
    severity: 'WARNING',
    thresholds: { thresholdPercent: 25, minClicks: 100 },
  },
  CONVERSION_RATE_DECLINE: {
    name: 'Conversion-rate decline',
    description: 'Conversion rate declined more than the threshold compared with the baseline period.',
    enabled: true,
    severity: 'WARNING',
    thresholds: { thresholdPercent: 20, minClicks: 150 },
  },
  SPEND_PACING: {
    name: 'Spend pacing off plan',
    description: 'Month-to-date spend deviates from the budget plan by more than the pacing tolerance.',
    enabled: true,
    severity: 'WARNING',
    thresholds: { minElapsedDays: 3 },
  },
  IMPRESSIONS_DROP: {
    name: 'Sudden impressions drop',
    description: 'Recent daily impressions dropped sharply against the preceding average.',
    enabled: true,
    severity: 'WARNING',
    thresholds: { dropPercent: 40, recentDays: 3, minBaselineImpressions: 1000 },
  },
  STRONG_ROAS_CONSTRAINED: {
    name: 'Strong ROAS, constrained volume',
    description: 'Campaign beats its ROAS target but loses a large share of impressions to budget.',
    enabled: true,
    severity: 'INFO',
    thresholds: { roasMultiple: 1.5, minBudgetLostPercent: 20 },
  },
  HIGH_BOUNCE_RATE: {
    name: 'High landing-page bounce rate',
    description: 'GA4 bounce rate for a paid landing page exceeds the threshold.',
    enabled: true,
    severity: 'WARNING',
    thresholds: { maxBounceRate: 70, minSessions: 200 },
  },
  MISSING_DATA: {
    name: 'Missing data',
    description: 'No performance data has been received for longer than the allowed lag.',
    enabled: true,
    severity: 'WARNING',
    thresholds: { maxLagDays: 2 },
  },
  CONVERSION_TRACKING_FAILURE: {
    name: 'Possible conversion-tracking failure',
    description: 'Account-wide conversions dropped to zero while traffic continued.',
    enabled: true,
    severity: 'CRITICAL',
    thresholds: { zeroDays: 2, minClicks: 50, minBaselineConversionsPerDay: 2 },
  },
  SYNC_FAILED: {
    name: 'Failed synchronization',
    description: 'The latest synchronization for an account failed.',
    enabled: true,
    severity: 'CRITICAL',
    thresholds: {},
  },
  OAUTH_ATTENTION: {
    name: 'Connection requires attention',
    description: 'A Google connection needs to be re-authorized or reported an error.',
    enabled: true,
    severity: 'CRITICAL',
    thresholds: {},
  },
};

const fingerprint = (type: AlertType, entityType: EntityType, entityId: string | null) =>
  `${type}:${entityType}:${entityId ?? 'none'}`;

const pct = (value: number | null) => formatPercent(value, { decimals: 1 });

function ruleFor(input: AlertEvaluationInput, type: AlertType): RuleConfig | null {
  const rule = input.rules[type] ?? DEFAULT_RULES[type];
  if (!rule.enabled) return null;
  return { ...rule, thresholds: { ...DEFAULT_RULES[type].thresholds, ...rule.thresholds } };
}

const t = (rule: RuleConfig, key: string) => rule.thresholds[key] ?? 0;

type RuleFn = (input: AlertEvaluationInput, rule: RuleConfig) => AlertCandidate[];

function campaignAlert(
  input: AlertEvaluationInput,
  c: CampaignSnapshot,
  fields: Omit<
    AlertCandidate,
    | 'entityType'
    | 'entityId'
    | 'entityName'
    | 'adAccountId'
    | 'campaignId'
    | 'windowStart'
    | 'windowEnd'
    | 'fingerprint'
  >,
): AlertCandidate {
  return {
    ...fields,
    entityType: 'CAMPAIGN',
    entityId: c.id,
    entityName: c.name,
    adAccountId: c.adAccountId,
    campaignId: c.id,
    windowStart: input.window.from,
    windowEnd: input.window.to,
    fingerprint: fingerprint(fields.type, 'CAMPAIGN', c.id),
  };
}

const highSpendZeroConversions: RuleFn = (input, rule) =>
  input.campaigns
    .filter((c) => c.current.cost >= t(rule, 'minSpend') && c.current.conversions === 0)
    .map((c) =>
      campaignAlert(input, c, {
        type: 'HIGH_SPEND_ZERO_CONVERSIONS',
        severity: rule.severity,
        metric: 'cost',
        currentValue: c.current.cost,
        baselineValue: c.baseline.conversions,
        difference: null,
        differencePercent: null,
        explanation: `${c.name} spent ${formatCurrency(c.current.cost, { currency: c.currencyCode })} between ${input.window.from} and ${input.window.to} without recording any conversions (baseline period: ${c.baseline.conversions.toFixed(1)} conversions).`,
        suggestedInvestigation:
          'Verify conversion tracking on the landing pages, then review search terms and placements that received spend. Check whether recent targeting or bidding changes coincide with the drop.',
      }),
    );

const cpaAboveTarget: RuleFn = (input, rule) =>
  input.campaigns.flatMap((c) => {
    if (c.current.cpa === null || c.current.conversions < t(rule, 'minConversions')) return [];
    const target = c.targets.CPA;
    const deviation = deviationFromTarget(c.current.cpa, target);
    if (deviation === null || deviation <= t(rule, 'tolerancePercent')) return [];
    return [
      campaignAlert(input, c, {
        type: 'CPA_ABOVE_TARGET',
        severity: deviation >= t(rule, 'criticalPercent') ? 'CRITICAL' : rule.severity,
        metric: 'cpa',
        currentValue: c.current.cpa,
        baselineValue: target,
        difference: c.current.cpa - target,
        differencePercent: deviation,
        explanation: `CPA for ${c.name} was ${formatCurrency(c.current.cpa, { currency: c.currencyCode })}, ${pct(deviation)} above the ${formatCurrency(target, { currency: c.currencyCode })} target.`,
        suggestedInvestigation:
          'Compare CPC and conversion-rate changes to see which component moved. Review device, location and search-term segments with the highest cost per conversion.',
      }),
    ];
  });

const roasBelowTarget: RuleFn = (input, rule) =>
  input.campaigns.flatMap((c) => {
    if (c.current.roas === null || c.current.cost < t(rule, 'minSpend')) return [];
    const target = c.targets.ROAS;
    const deviation = deviationFromTarget(c.current.roas, target);
    if (deviation === null || -deviation <= t(rule, 'tolerancePercent')) return [];
    return [
      campaignAlert(input, c, {
        type: 'ROAS_BELOW_TARGET',
        severity: -deviation >= t(rule, 'criticalPercent') ? 'CRITICAL' : rule.severity,
        metric: 'roas',
        currentValue: c.current.roas,
        baselineValue: target,
        difference: c.current.roas - target,
        differencePercent: deviation,
        explanation: `ROAS for ${c.name} was ${formatRatio(c.current.roas)}, ${pct(Math.abs(deviation))} below the ${formatRatio(target)} target.`,
        suggestedInvestigation:
          'Check whether average order value or conversion volume changed. Review product/segment mix and landing-page performance before adjusting bids or budgets.',
      }),
    ];
  });

const ctrBelowTarget: RuleFn = (input, rule) =>
  input.campaigns.flatMap((c) => {
    if (c.current.ctr === null || c.current.impressions < t(rule, 'minImpressions')) return [];
    const target = c.targets.CTR;
    const deviation = deviationFromTarget(c.current.ctr, target);
    if (deviation === null || -deviation <= t(rule, 'tolerancePercent')) return [];
    return [
      campaignAlert(input, c, {
        type: 'CTR_BELOW_TARGET',
        severity: rule.severity,
        metric: 'ctr',
        currentValue: c.current.ctr,
        baselineValue: target,
        difference: c.current.ctr - target,
        differencePercent: deviation,
        explanation: `${c.name} served ${c.current.impressions.toLocaleString('en-US')} impressions with a CTR of ${pct(c.current.ctr)}, below the ${pct(target)} threshold.`,
        suggestedInvestigation:
          'Review ad copy relevance, audience or placement quality and keyword match types. High impressions with low CTR often indicate broad targeting.',
      }),
    ];
  });

function changeRule(
  type: 'CPC_INCREASE' | 'CONVERSION_RATE_DECLINE',
  metric: 'cpc' | 'conversionRate',
  direction: 1 | -1,
): RuleFn {
  return (input, rule) =>
    input.campaigns.flatMap((c) => {
      const current = c.current[metric];
      const baseline = c.baseline[metric];
      if (current === null || baseline === null || baseline === 0) return [];
      if (c.current.clicks < t(rule, 'minClicks') || c.baseline.clicks < t(rule, 'minClicks')) return [];
      const change = (safeDivide(current - baseline, baseline)?.toNumber() ?? 0) * 100;
      if (change * direction <= t(rule, 'thresholdPercent')) return [];
      const isCpc = metric === 'cpc';
      const fmt = (v: number) => (isCpc ? formatCurrency(v, { currency: c.currencyCode }) : pct(v));
      return [
        campaignAlert(input, c, {
          type,
          severity: rule.severity,
          metric,
          currentValue: current,
          baselineValue: baseline,
          difference: current - baseline,
          differencePercent: change,
          explanation: `${isCpc ? 'Average CPC' : 'Conversion rate'} for ${c.name} moved from ${fmt(baseline)} to ${fmt(current)} (${change > 0 ? '+' : ''}${change.toFixed(1)}%) compared with ${input.baselineWindow.from} – ${input.baselineWindow.to}.`,
          suggestedInvestigation: isCpc
            ? 'Check auction insights for new competitors, recent bid-strategy or target changes, and quality score movement on top keywords.'
            : 'Check landing-page availability and speed, form or checkout changes, offer changes and traffic mix shifts across devices and locations.',
        }),
      ];
    });
}

const spendPacing: RuleFn = (input, rule) =>
  input.accounts.flatMap((a) => {
    if (!a.monthlyPlan || a.elapsedDaysInMonth < t(rule, 'minElapsedDays')) return [];
    const expected = (a.monthlyPlan * a.elapsedDaysInMonth) / a.daysInMonth;
    const deviation = deviationFromTarget(a.monthToDateSpend, expected);
    if (deviation === null || Math.abs(deviation) <= a.pacingTolerancePercent) return [];
    const over = deviation > 0;
    return [
      {
        type: 'SPEND_PACING' as const,
        severity: Math.abs(deviation) > a.pacingTolerancePercent * 2 ? 'CRITICAL' : rule.severity,
        entityType: 'AD_ACCOUNT' as const,
        entityId: a.id,
        entityName: a.name,
        adAccountId: a.id,
        campaignId: null,
        metric: 'cost',
        currentValue: a.monthToDateSpend,
        baselineValue: expected,
        difference: a.monthToDateSpend - expected,
        differencePercent: deviation,
        windowStart: `${input.today.slice(0, 7)}-01`,
        windowEnd: input.window.to,
        explanation: `Month-to-date spend for ${a.name} is ${formatCurrency(a.monthToDateSpend, { currency: a.currencyCode })}, ${pct(Math.abs(deviation))} ${over ? 'above' : 'below'} the planned ${formatCurrency(expected, { currency: a.currencyCode })} (tolerance ±${a.pacingTolerancePercent}%).`,
        suggestedInvestigation: over
          ? 'Review campaigns with the largest spend increases and confirm budget changes were intentional before the month-end cap is reached.'
          : 'Check for limited delivery, paused campaigns, disapproved ads or bids that are too restrictive.',
        fingerprint: fingerprint('SPEND_PACING', 'AD_ACCOUNT', a.id),
      },
    ];
  });

const impressionsDrop: RuleFn = (input, rule) =>
  input.campaigns.flatMap((c) => {
    const recentDays = Math.max(1, t(rule, 'recentDays'));
    const series = c.recentImpressions;
    if (series.length <= recentDays + 3) return [];
    const recent = series.slice(-recentDays);
    const prior = series.slice(0, -recentDays);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
    if (priorAvg < t(rule, 'minBaselineImpressions')) return [];
    const drop = ((priorAvg - recentAvg) / priorAvg) * 100;
    if (drop <= t(rule, 'dropPercent')) return [];
    return [
      campaignAlert(input, c, {
        type: 'IMPRESSIONS_DROP',
        severity: rule.severity,
        metric: 'impressions',
        currentValue: Math.round(recentAvg),
        baselineValue: Math.round(priorAvg),
        difference: Math.round(recentAvg - priorAvg),
        differencePercent: -drop,
        explanation: `Daily impressions for ${c.name} averaged ${Math.round(recentAvg).toLocaleString('en-US')} over the last ${recentDays} days versus ${Math.round(priorAvg).toLocaleString('en-US')} previously (−${drop.toFixed(1)}%).`,
        suggestedInvestigation:
          'Check for ad disapprovals, budget exhaustion, audience or placement exclusions, bid changes and policy notices in Google Ads.',
      }),
    ];
  });

const strongRoasConstrained: RuleFn = (input, rule) =>
  input.campaigns.flatMap((c) => {
    const lost = c.budgetLostImpressionShare;
    if (c.current.roas === null || lost === null) return [];
    if (
      c.current.roas < c.targets.ROAS * t(rule, 'roasMultiple') ||
      lost * 100 < t(rule, 'minBudgetLostPercent')
    )
      return [];
    return [
      campaignAlert(input, c, {
        type: 'STRONG_ROAS_CONSTRAINED',
        severity: rule.severity,
        metric: 'roas',
        currentValue: c.current.roas,
        baselineValue: c.targets.ROAS,
        difference: c.current.roas - c.targets.ROAS,
        differencePercent: deviationFromTarget(c.current.roas, c.targets.ROAS),
        explanation: `${c.name} delivered ${formatRatio(c.current.roas)} ROAS (target ${formatRatio(c.targets.ROAS)}) while losing ${pct(lost * 100)} of search impression share to budget.`,
        suggestedInvestigation:
          'Evaluate a controlled budget increase and monitor whether marginal ROAS holds; returns typically diminish as volume grows.',
      }),
    ];
  });

const highBounceRate: RuleFn = (input, rule) =>
  input.landingPages.flatMap((p) => {
    if (p.sessions === null || p.engagedSessions === null || p.sessions < t(rule, 'minSessions')) return [];
    const bounce = (1 - p.engagedSessions / p.sessions) * 100;
    if (bounce <= t(rule, 'maxBounceRate')) return [];
    return [
      {
        type: 'HIGH_BOUNCE_RATE' as const,
        severity: rule.severity,
        entityType: 'LANDING_PAGE' as const,
        entityId: p.id,
        entityName: p.url,
        adAccountId: p.adAccountId,
        campaignId: null,
        metric: 'bounceRate',
        currentValue: bounce,
        baselineValue: t(rule, 'maxBounceRate'),
        difference: bounce - t(rule, 'maxBounceRate'),
        differencePercent: null,
        windowStart: input.window.from,
        windowEnd: input.window.to,
        explanation: `${p.url} had a GA4 bounce rate of ${pct(bounce)} across ${p.sessions.toLocaleString('en-US')} paid sessions (threshold ${pct(t(rule, 'maxBounceRate'))}).`,
        suggestedInvestigation:
          'Review page load speed on mobile, message match between ads and page headline, and whether the primary call to action is visible above the fold.',
        fingerprint: fingerprint('HIGH_BOUNCE_RATE', 'LANDING_PAGE', p.id),
      },
    ];
  });

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const missingData: RuleFn = (input, rule) =>
  input.accounts.flatMap((a) => {
    const lag = a.lastMetricDate ? daysBetween(a.lastMetricDate, input.today) : Number.POSITIVE_INFINITY;
    if (lag <= t(rule, 'maxLagDays')) return [];
    return [
      {
        type: 'MISSING_DATA' as const,
        severity: rule.severity,
        entityType: 'AD_ACCOUNT' as const,
        entityId: a.id,
        entityName: a.name,
        adAccountId: a.id,
        campaignId: null,
        metric: 'dataFreshness',
        currentValue: Number.isFinite(lag) ? lag : null,
        baselineValue: t(rule, 'maxLagDays'),
        difference: Number.isFinite(lag) ? lag - t(rule, 'maxLagDays') : null,
        differencePercent: null,
        windowStart: a.lastMetricDate ?? input.window.from,
        windowEnd: input.today,
        explanation: a.lastMetricDate
          ? `The most recent data for ${a.name} is from ${a.lastMetricDate} (${lag} days old).`
          : `No performance data has been imported for ${a.name}.`,
        suggestedInvestigation:
          'Check the latest sync job, connection status and whether the account is still accessible.',
        fingerprint: fingerprint('MISSING_DATA', 'AD_ACCOUNT', a.id),
      },
    ];
  });

const conversionTrackingFailure: RuleFn = (input, rule) =>
  input.accounts.flatMap((a) => {
    const zeroDays = Math.max(1, t(rule, 'zeroDays'));
    if (a.recentDaily.length <= zeroDays + 3) return [];
    const recent = a.recentDaily.slice(-zeroDays);
    const prior = a.recentDaily.slice(0, -zeroDays);
    const recentConversions = recent.reduce((s, d) => s + d.conversions, 0);
    const recentClicks = recent.reduce((s, d) => s + d.clicks, 0);
    const priorPerDay = prior.reduce((s, d) => s + d.conversions, 0) / prior.length;
    if (
      recentConversions > 0 ||
      recentClicks < t(rule, 'minClicks') ||
      priorPerDay < t(rule, 'minBaselineConversionsPerDay')
    ) {
      return [];
    }
    return [
      {
        type: 'CONVERSION_TRACKING_FAILURE' as const,
        severity: rule.severity,
        entityType: 'AD_ACCOUNT' as const,
        entityId: a.id,
        entityName: a.name,
        adAccountId: a.id,
        campaignId: null,
        metric: 'conversions',
        currentValue: 0,
        baselineValue: priorPerDay,
        difference: -priorPerDay,
        differencePercent: -100,
        windowStart: recent[0]?.date ?? input.window.from,
        windowEnd: recent[recent.length - 1]?.date ?? input.window.to,
        explanation: `${a.name} recorded ${recentClicks.toLocaleString('en-US')} clicks but zero conversions over the last ${zeroDays} days, compared with ${priorPerDay.toFixed(1)} conversions per day before.`,
        suggestedInvestigation:
          'Check the Google Ads conversion action status, tag firing (Tag Assistant), consent-mode changes and recent website deployments.',
        fingerprint: fingerprint('CONVERSION_TRACKING_FAILURE', 'AD_ACCOUNT', a.id),
      },
    ];
  });

const syncFailed: RuleFn = (input, rule) =>
  input.latestSyncs
    .filter((s) => s.status === 'FAILED')
    .map((s) => ({
      type: 'SYNC_FAILED' as const,
      severity: rule.severity,
      entityType: 'SYNC_JOB' as const,
      entityId: s.id,
      entityName: s.adAccountName,
      adAccountId: s.adAccountId,
      campaignId: null,
      metric: 'syncStatus',
      currentValue: null,
      baselineValue: null,
      difference: null,
      differencePercent: null,
      windowStart: (s.finishedAt ?? input.today).slice(0, 10),
      windowEnd: (s.finishedAt ?? input.today).slice(0, 10),
      explanation: `The latest synchronization for ${s.adAccountName ?? 'an account'} failed${s.errorMessage ? `: ${s.errorMessage}` : '.'}`,
      suggestedInvestigation:
        'Open Integrations to review error details, then retry the sync. Re-authorize the connection if the error mentions authorization.',
      fingerprint: fingerprint('SYNC_FAILED', 'AD_ACCOUNT', s.adAccountId),
    }));

const oauthAttention: RuleFn = (input, rule) =>
  input.connections
    .filter((c) => c.status === 'NEEDS_ATTENTION' || c.status === 'ERROR')
    .map((c) => ({
      type: 'OAUTH_ATTENTION' as const,
      severity: rule.severity,
      entityType: 'CONNECTION' as const,
      entityId: c.id,
      entityName: c.provider === 'GOOGLE_ADS' ? 'Google Ads connection' : 'Google Analytics connection',
      adAccountId: null,
      campaignId: null,
      metric: 'connectionStatus',
      currentValue: null,
      baselineValue: null,
      difference: null,
      differencePercent: null,
      windowStart: input.today,
      windowEnd: input.today,
      explanation: `The ${c.provider === 'GOOGLE_ADS' ? 'Google Ads' : 'GA4'} connection is in state ${c.status}${c.lastError ? ` (${c.lastError})` : ''}.`,
      suggestedInvestigation:
        'Reconnect the integration from the Integrations page with an account that still has access.',
      fingerprint: fingerprint('OAUTH_ATTENTION', 'CONNECTION', c.id),
    }));

export const RULES: Record<AlertType, RuleFn> = {
  HIGH_SPEND_ZERO_CONVERSIONS: highSpendZeroConversions,
  CPA_ABOVE_TARGET: cpaAboveTarget,
  ROAS_BELOW_TARGET: roasBelowTarget,
  CTR_BELOW_TARGET: ctrBelowTarget,
  CPC_INCREASE: changeRule('CPC_INCREASE', 'cpc', 1),
  CONVERSION_RATE_DECLINE: changeRule('CONVERSION_RATE_DECLINE', 'conversionRate', -1),
  SPEND_PACING: spendPacing,
  IMPRESSIONS_DROP: impressionsDrop,
  STRONG_ROAS_CONSTRAINED: strongRoasConstrained,
  HIGH_BOUNCE_RATE: highBounceRate,
  MISSING_DATA: missingData,
  CONVERSION_TRACKING_FAILURE: conversionTrackingFailure,
  SYNC_FAILED: syncFailed,
  OAUTH_ATTENTION: oauthAttention,
};

export function evaluateAlertRules(input: AlertEvaluationInput): AlertCandidate[] {
  return (Object.keys(RULES) as AlertType[]).flatMap((type) => {
    const rule = ruleFor(input, type);
    return rule ? RULES[type](input, rule) : [];
  });
}
