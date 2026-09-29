import { describe, expect, it } from 'vitest';
import {
  actionSchema,
  actionTransitionSchema,
  alertUpdateSchema,
  createOrganizationSchema,
  organizationSettingsSchema,
  passwordSchema,
  recommendationSchema,
  registerSchema,
  reportRequestSchema,
  targetSchema,
} from '../src';

describe('password policy', () => {
  it('accepts strong passwords', () => {
    expect(passwordSchema.safeParse('Str0ng!Passw0rd').success).toBe(true);
  });

  it.each(['short1!A', 'alllowercase123!', 'ALLUPPERCASE123!', 'NoDigitsHere!!', 'NoSymbols12345'])(
    'rejects %s',
    (pw) => {
      expect(passwordSchema.safeParse(pw).success).toBe(false);
    },
  );
});

describe('registerSchema', () => {
  it('requires matching passwords and accepted terms', () => {
    const result = registerSchema.safeParse({
      name: 'Ann',
      email: 'ANN@Example.com ',
      password: 'Str0ng!Passw0rd',
      confirmPassword: 'Different1!Pass',
      acceptTerms: true,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('normalizes email', () => {
    const result = registerSchema.parse({
      name: 'Ann',
      email: 'ANN@Example.com',
      password: 'Str0ng!Passw0rd',
      confirmPassword: 'Str0ng!Passw0rd',
      acceptTerms: true,
    });
    expect(result.email).toBe('ann@example.com');
  });
});

describe('organization schemas', () => {
  it('validates timezone and supported currency', () => {
    expect(
      createOrganizationSchema.safeParse({ name: 'Acme', currencyCode: 'USD', timezone: 'Europe/Berlin' })
        .success,
    ).toBe(true);
    expect(
      createOrganizationSchema.safeParse({ name: 'Acme', currencyCode: 'usd', timezone: 'Europe/Berlin' })
        .success,
    ).toBe(false);
    expect(
      createOrganizationSchema.safeParse({ name: 'Acme', currencyCode: 'XYZ', timezone: 'Europe/Berlin' })
        .success,
    ).toBe(false);
    expect(
      createOrganizationSchema.safeParse({ name: 'Acme', currencyCode: 'USD', timezone: 'Mars/Base' })
        .success,
    ).toBe(false);
  });

  it('turns empty branding fields into null and requires https logos', () => {
    const base = {
      name: 'Acme',
      currencyCode: 'EUR',
      timezone: 'UTC',
      dataRetentionDays: 730,
      reportingPreferences: {
        defaultDateRangeDays: 30,
        weekStartsOn: 1,
        compareByDefault: true,
        weeklyReportEnabled: true,
        monthlyReportEnabled: true,
        dailySummaryEnabled: false,
      },
    } as const;
    const ok = organizationSettingsSchema.parse({
      ...base,
      branding: { primaryColor: '#3949AB', logoUrl: '', reportFooter: '  ' },
    });
    expect(ok.branding).toEqual({ primaryColor: '#3949AB', logoUrl: null, reportFooter: null });
    expect(
      organizationSettingsSchema.safeParse({
        ...base,
        branding: { primaryColor: '#3949AB', logoUrl: 'http://x.test/logo.png', reportFooter: null },
      }).success,
    ).toBe(false);
  });
});

describe('targetSchema', () => {
  it('requires the scoped entity and strips irrelevant ids', () => {
    expect(
      targetSchema.safeParse({
        scope: 'CAMPAIGN',
        metric: 'CPA',
        value: 50,
        adAccountId: null,
        campaignId: null,
      }).success,
    ).toBe(false);
    expect(
      targetSchema.parse({
        scope: 'ORGANIZATION',
        metric: 'CPA',
        value: '42.5',
        adAccountId: 'acc',
        campaignId: null,
      }),
    ).toEqual({
      scope: 'ORGANIZATION',
      metric: 'CPA',
      value: 42.5,
    });
  });

  it('caps percentage targets and decimals', () => {
    expect(
      targetSchema.safeParse({
        scope: 'ORGANIZATION',
        metric: 'CTR',
        value: 150,
        adAccountId: null,
        campaignId: null,
      }).success,
    ).toBe(false);
    expect(
      targetSchema.safeParse({
        scope: 'ORGANIZATION',
        metric: 'ROAS',
        value: 1.23456,
        adAccountId: null,
        campaignId: null,
      }).success,
    ).toBe(false);
  });
});

describe('actionSchema', () => {
  it('normalizes empty inputs to null', () => {
    const parsed = actionSchema.parse({
      title: ' Pause weak keywords ',
      description: '',
      hypothesis: 'Lower CPA',
      expectedImpact: '',
      priority: 'HIGH',
      ownerId: null,
      campaignId: null,
      adGroupId: null,
      metricToMonitor: 'cpa',
      baselineValue: '52.1',
      targetValue: '',
      plannedDate: null,
      evaluationDate: null,
      attachments: [],
    });
    expect(parsed).toMatchObject({
      title: 'Pause weak keywords',
      description: null,
      expectedImpact: null,
      baselineValue: 52.1,
      targetValue: null,
    });
  });
});

describe('actionTransitionSchema', () => {
  it('requires a cancellation reason and sends only relevant fields', () => {
    expect(actionTransitionSchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
    expect(
      actionTransitionSchema.parse({
        status: 'CANCELLED',
        cancellationReason: 'Budget frozen by finance',
        actualResult: 'x',
      }),
    ).toEqual({
      status: 'CANCELLED',
      cancellationReason: 'Budget frozen by finance',
    });
  });

  it('requires evaluation details', () => {
    expect(actionTransitionSchema.safeParse({ status: 'EVALUATED' }).success).toBe(false);
    expect(
      actionTransitionSchema.parse({
        status: 'EVALUATED',
        resultClassification: 'POSITIVE',
        actualResult: 'CPA dropped by 18% after two weeks',
        actualValue: '41',
      }),
    ).toEqual({
      status: 'EVALUATED',
      resultClassification: 'POSITIVE',
      actualResult: 'CPA dropped by 18% after two weeks',
      actualValue: 41,
    });
  });
});

describe('alertUpdateSchema', () => {
  it('requires a note to resolve or dismiss', () => {
    expect(
      alertUpdateSchema.safeParse({ status: 'RESOLVED', assigneeId: null, resolutionNote: '' }).success,
    ).toBe(false);
    expect(
      alertUpdateSchema.safeParse({ status: 'ACKNOWLEDGED', assigneeId: null, resolutionNote: '' }).success,
    ).toBe(true);
  });
});

describe('recommendationSchema', () => {
  it('requires evidence', () => {
    const base = {
      type: 'REVIEW_DEVICE_PERFORMANCE',
      title: 'Review mobile bids',
      rationale: 'Mobile CPA is 40% above desktop over 30 days.',
      confidence: 'MEDIUM',
      campaignId: null,
    };
    expect(recommendationSchema.safeParse({ ...base, evidence: [] }).success).toBe(false);
    expect(
      recommendationSchema.safeParse({ ...base, evidence: [{ label: 'Mobile CPA', value: '$62.10' }] })
        .success,
    ).toBe(true);
  });
});

describe('reportRequestSchema', () => {
  it('rejects inverted periods', () => {
    const r = reportRequestSchema.safeParse({
      templateId: null,
      frequency: 'WEEKLY',
      format: 'PDF',
      title: 'Weekly',
      from: '2026-02-10',
      to: '2026-02-01',
      adAccountId: null,
      campaignIds: [],
      commentary: '',
    });
    expect(r.success).toBe(false);
  });
});
