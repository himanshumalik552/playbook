import { describe, expect, it } from 'vitest';
import type { AlertType } from '@adpulse/types';
import {
  DEFAULT_RULES,
  evaluateAlertRules,
  type AccountSnapshot,
  type AlertEvaluationInput,
  type CampaignSnapshot,
} from '../src/alerts/rules';
import { kpis } from './fixtures';

const TARGETS = { CPA: 50, ROAS: 3, CTR: 1, CONVERSION_RATE: 2, SPEND_PACING_TOLERANCE: 15 };

function campaign(overrides: Partial<CampaignSnapshot> = {}): CampaignSnapshot {
  return {
    id: 'c1',
    name: 'Brand Search',
    adAccountId: 'a1',
    currencyCode: 'USD',
    current: kpis({ impressions: 10_000, clicks: 500, cost: 500, conversions: 20, conversionValue: 2000 }),
    baseline: kpis({ impressions: 10_000, clicks: 500, cost: 500, conversions: 20, conversionValue: 2000 }),
    targets: TARGETS,
    budgetLostImpressionShare: 0,
    recentImpressions: Array.from({ length: 10 }, () => 1500),
    ...overrides,
  };
}

function account(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    id: 'a1',
    name: 'Main account',
    currencyCode: 'USD',
    lastMetricDate: '2026-09-27',
    recentDaily: Array.from({ length: 10 }, (_, i) => ({
      date: `2026-09-${String(18 + i).padStart(2, '0')}`,
      clicks: 100,
      conversions: 5,
    })),
    monthToDateSpend: 2700,
    monthlyPlan: 3000,
    elapsedDaysInMonth: 27,
    daysInMonth: 30,
    pacingTolerancePercent: 15,
    ...overrides,
  };
}

function input(overrides: Partial<AlertEvaluationInput> = {}): AlertEvaluationInput {
  return {
    today: '2026-09-28',
    window: { from: '2026-09-21', to: '2026-09-27' },
    baselineWindow: { from: '2026-08-24', to: '2026-09-20' },
    campaigns: [campaign()],
    landingPages: [],
    accounts: [account()],
    connections: [],
    latestSyncs: [],
    rules: {},
    ...overrides,
  };
}

const types = (i: AlertEvaluationInput): AlertType[] => evaluateAlertRules(i).map((a) => a.type);

describe('evaluateAlertRules', () => {
  it('produces no alerts for a healthy account', () => {
    expect(evaluateAlertRules(input())).toEqual([]);
  });

  it('defines all 14 alert types', () => {
    expect(Object.keys(DEFAULT_RULES)).toHaveLength(14);
  });

  it('flags high spend with zero conversions', () => {
    const c = campaign({ current: kpis({ impressions: 8000, clicks: 300, cost: 400, conversions: 0 }) });
    const alerts = evaluateAlertRules(input({ campaigns: [c] }));
    const alert = alerts.find((a) => a.type === 'HIGH_SPEND_ZERO_CONVERSIONS');
    expect(alert).toMatchObject({
      severity: 'CRITICAL',
      entityType: 'CAMPAIGN',
      entityId: 'c1',
      fingerprint: 'HIGH_SPEND_ZERO_CONVERSIONS:CAMPAIGN:c1',
    });
    expect(alert?.explanation).toContain('$400.00');
  });

  it('flags CPA above target with warning and critical severities', () => {
    const warn = campaign({
      current: kpis({ impressions: 10_000, clicks: 500, cost: 600, conversions: 10, conversionValue: 3000 }),
    });
    expect(
      evaluateAlertRules(input({ campaigns: [warn] })).find((a) => a.type === 'CPA_ABOVE_TARGET')?.severity,
    ).toBe('WARNING');
    const crit = campaign({
      current: kpis({ impressions: 10_000, clicks: 500, cost: 900, conversions: 10, conversionValue: 4000 }),
    });
    const alert = evaluateAlertRules(input({ campaigns: [crit] })).find((a) => a.type === 'CPA_ABOVE_TARGET');
    expect(alert?.severity).toBe('CRITICAL');
    expect(alert?.currentValue).toBe(90);
    expect(alert?.differencePercent).toBeCloseTo(80);
  });

  it('ignores CPA when conversion volume is too low', () => {
    const c = campaign({
      current: kpis({ impressions: 10_000, clicks: 500, cost: 600, conversions: 2, conversionValue: 3000 }),
    });
    expect(types(input({ campaigns: [c] }))).not.toContain('CPA_ABOVE_TARGET');
  });

  it('flags ROAS below target', () => {
    const c = campaign({
      current: kpis({ impressions: 10_000, clicks: 500, cost: 500, conversions: 20, conversionValue: 800 }),
    });
    const alert = evaluateAlertRules(input({ campaigns: [c] })).find((a) => a.type === 'ROAS_BELOW_TARGET');
    expect(alert?.severity).toBe('CRITICAL');
    expect(alert?.currentValue).toBe(1.6);
  });

  it('flags ROAS below target as a warning within the critical band', () => {
    const c = campaign({
      current: kpis({ impressions: 10_000, clicks: 500, cost: 500, conversions: 20, conversionValue: 1200 }),
    });
    expect(
      evaluateAlertRules(input({ campaigns: [c] })).find((a) => a.type === 'ROAS_BELOW_TARGET')?.severity,
    ).toBe('WARNING');
  });

  it('flags CTR below target only with enough impressions', () => {
    const low = campaign({
      current: kpis({ impressions: 50_000, clicks: 200, cost: 500, conversions: 20, conversionValue: 2000 }),
    });
    expect(types(input({ campaigns: [low] }))).toContain('CTR_BELOW_TARGET');
    const small = campaign({
      current: kpis({ impressions: 1000, clicks: 4, cost: 500, conversions: 20, conversionValue: 2000 }),
    });
    expect(types(input({ campaigns: [small] }))).not.toContain('CTR_BELOW_TARGET');
  });

  it('flags CPC increase against baseline', () => {
    const c = campaign({
      current: kpis({ impressions: 10_000, clicks: 500, cost: 700, conversions: 20, conversionValue: 3000 }),
    });
    const alert = evaluateAlertRules(input({ campaigns: [c] })).find((a) => a.type === 'CPC_INCREASE');
    expect(alert?.differencePercent).toBeCloseTo(40);
    expect(alert?.explanation).toContain('+40.0%');
  });

  it('flags conversion-rate decline', () => {
    const c = campaign({
      current: kpis({ impressions: 10_000, clicks: 500, cost: 500, conversions: 12, conversionValue: 2000 }),
    });
    const alert = evaluateAlertRules(input({ campaigns: [c] })).find(
      (a) => a.type === 'CONVERSION_RATE_DECLINE',
    );
    expect(alert?.differencePercent).toBeCloseTo(-40);
  });

  it('skips change rules when the baseline is empty', () => {
    const c = campaign({ baseline: kpis({}) });
    expect(types(input({ campaigns: [c] }))).not.toContain('CPC_INCREASE');
  });

  it('flags overspend and underspend pacing', () => {
    const over = evaluateAlertRules(input({ accounts: [account({ monthToDateSpend: 3300 })] })).find(
      (a) => a.type === 'SPEND_PACING',
    );
    expect(over?.explanation).toContain('above');
    expect(over?.severity).toBe('WARNING');
    const under = evaluateAlertRules(input({ accounts: [account({ monthToDateSpend: 1000 })] })).find(
      (a) => a.type === 'SPEND_PACING',
    );
    expect(under?.explanation).toContain('below');
    expect(under?.severity).toBe('CRITICAL');
  });

  it('skips pacing without a plan or early in the month', () => {
    expect(
      types(input({ accounts: [account({ monthlyPlan: null, monthToDateSpend: 9000 })] })),
    ).not.toContain('SPEND_PACING');
    expect(
      types(input({ accounts: [account({ elapsedDaysInMonth: 2, monthToDateSpend: 9000 })] })),
    ).not.toContain('SPEND_PACING');
  });

  it('flags a sudden impressions drop', () => {
    const c = campaign({ recentImpressions: [2000, 2000, 2000, 2000, 2000, 2000, 2000, 500, 400, 300] });
    const alert = evaluateAlertRules(input({ campaigns: [c] })).find((a) => a.type === 'IMPRESSIONS_DROP');
    expect(alert).toMatchObject({ currentValue: 400, baselineValue: 2000 });
  });

  it('does not flag impressions drops on short or small series', () => {
    expect(types(input({ campaigns: [campaign({ recentImpressions: [2000, 100] })] }))).not.toContain(
      'IMPRESSIONS_DROP',
    );
    expect(
      types(
        input({ campaigns: [campaign({ recentImpressions: [100, 100, 100, 100, 100, 100, 100, 1, 1, 1] })] }),
      ),
    ).not.toContain('IMPRESSIONS_DROP');
  });

  it('flags strong ROAS constrained by budget', () => {
    const c = campaign({
      current: kpis({ impressions: 10_000, clicks: 500, cost: 500, conversions: 20, conversionValue: 3000 }),
      budgetLostImpressionShare: 0.35,
    });
    expect(types(input({ campaigns: [c] }))).toContain('STRONG_ROAS_CONSTRAINED');
    expect(types(input({ campaigns: [{ ...c, budgetLostImpressionShare: null }] }))).not.toContain(
      'STRONG_ROAS_CONSTRAINED',
    );
  });

  it('flags high bounce rate landing pages', () => {
    const alerts = evaluateAlertRules(
      input({
        landingPages: [
          {
            id: 'lp1',
            url: 'https://example.com/quote',
            adAccountId: 'a1',
            sessions: 1000,
            engagedSessions: 150,
          },
          {
            id: 'lp2',
            url: 'https://example.com/ok',
            adAccountId: 'a1',
            sessions: 1000,
            engagedSessions: 700,
          },
          {
            id: 'lp3',
            url: 'https://example.com/none',
            adAccountId: 'a1',
            sessions: null,
            engagedSessions: null,
          },
        ],
      }),
    ).filter((a) => a.type === 'HIGH_BOUNCE_RATE');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.currentValue).toBeCloseTo(85);
  });

  it('flags missing data for stale or empty accounts', () => {
    const stale = evaluateAlertRules(input({ accounts: [account({ lastMetricDate: '2026-09-20' })] })).find(
      (a) => a.type === 'MISSING_DATA',
    );
    expect(stale?.currentValue).toBe(8);
    const empty = evaluateAlertRules(input({ accounts: [account({ lastMetricDate: null })] })).find(
      (a) => a.type === 'MISSING_DATA',
    );
    expect(empty?.currentValue).toBeNull();
    expect(empty?.explanation).toContain('No performance data');
  });

  it('flags a possible conversion-tracking failure', () => {
    const recentDaily = account().recentDaily.map((d, i) => (i >= 8 ? { ...d, conversions: 0 } : d));
    const alert = evaluateAlertRules(input({ accounts: [account({ recentDaily })] })).find(
      (a) => a.type === 'CONVERSION_TRACKING_FAILURE',
    );
    expect(alert).toMatchObject({ severity: 'CRITICAL', windowStart: '2026-09-26', windowEnd: '2026-09-27' });
  });

  it('flags failed syncs and connections needing attention', () => {
    const alerts = evaluateAlertRules(
      input({
        latestSyncs: [
          {
            id: 's1',
            adAccountId: 'a1',
            adAccountName: 'Main',
            status: 'FAILED',
            errorMessage: 'quota',
            finishedAt: '2026-09-28T06:00:00Z',
          },
          {
            id: 's2',
            adAccountId: 'a2',
            adAccountName: 'Other',
            status: 'SUCCEEDED',
            errorMessage: null,
            finishedAt: null,
          },
        ],
        connections: [
          { id: 'g1', provider: 'GOOGLE_ADS', status: 'NEEDS_ATTENTION', lastError: 'invalid_grant' },
          { id: 'g2', provider: 'GOOGLE_ANALYTICS', status: 'ERROR', lastError: null },
          { id: 'g3', provider: 'GOOGLE_ADS', status: 'CONNECTED', lastError: null },
        ],
      }),
    );
    const sync = alerts.filter((a) => a.type === 'SYNC_FAILED');
    expect(sync).toHaveLength(1);
    expect(sync[0]?.explanation).toContain('quota');
    expect(sync[0]?.fingerprint).toBe('SYNC_FAILED:AD_ACCOUNT:a1');
    const oauth = alerts.filter((a) => a.type === 'OAUTH_ATTENTION');
    expect(oauth.map((a) => a.entityName)).toEqual(['Google Ads connection', 'Google Analytics connection']);
  });

  it('respects disabled rules and custom thresholds', () => {
    const c = campaign({ current: kpis({ impressions: 8000, clicks: 300, cost: 400, conversions: 0 }) });
    const disabled = {
      HIGH_SPEND_ZERO_CONVERSIONS: { ...DEFAULT_RULES.HIGH_SPEND_ZERO_CONVERSIONS, enabled: false },
    };
    expect(types(input({ campaigns: [c], rules: disabled }))).not.toContain('HIGH_SPEND_ZERO_CONVERSIONS');
    const raised = {
      HIGH_SPEND_ZERO_CONVERSIONS: {
        enabled: true,
        severity: 'WARNING' as const,
        thresholds: { minSpend: 1000 },
      },
    };
    expect(types(input({ campaigns: [c], rules: raised }))).not.toContain('HIGH_SPEND_ZERO_CONVERSIONS');
  });
});
