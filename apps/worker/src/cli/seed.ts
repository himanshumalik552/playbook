import { type AppEnv, loadEnv } from '@adpulse/config';
import {
  AlertEvaluationService,
  createLogger,
  createStorageProvider,
  EncryptionService,
  hashPassword,
  type Logger,
  mockPropertyId,
  planSyncJobs,
  ProviderFactory,
  PuppeteerPdfRenderer,
  recordAudit,
  RecommendationService,
  ReportGenerationService,
  SyncService,
  targetScopeKey,
} from '@adpulse/core';
import { createPrismaClient, dbDate, fromDbDate, Prisma, type PrismaClient } from '@adpulse/database';
import { addDays, isoDateInTimezone } from '@adpulse/kpi';
import { MOCK_ACCOUNTS, MOCK_MANAGER_ACCOUNT } from '@adpulse/mock-data';
import { DEFAULT_REPORTING_PREFERENCES, REPORT_SECTIONS, type OrgRole } from '@adpulse/types';

/** Development-only defaults, documented in README.md. Production seeding requires explicit values. */
const DEV_ADMIN_PASSWORD = 'AdPulse-Admin-2026!';
const DEV_DEMO_PASSWORD = 'AdPulse-Demo-2026!';

const DEMO_ORG_SLUG = 'northwind-demo';
const SECOND_ORG_SLUG = 'fabrikam-demo';

const DEMO_USERS: { email: string; name: string; role: OrgRole }[] = [
  { email: 'admin@northwind.demo', name: 'Avery Admin', role: 'ORGANIZATION_ADMIN' },
  { email: 'manager@northwind.demo', name: 'Morgan Manager', role: 'MARKETING_MANAGER' },
  { email: 'analyst@northwind.demo', name: 'Riley Analyst', role: 'ANALYST' },
  { email: 'viewer@northwind.demo', name: 'Casey Viewer', role: 'VIEWER' },
];

const HOURS = 3_600_000;

async function upsertUser(
  db: PrismaClient,
  email: string,
  name: string,
  passwordHash: string,
  systemRole: 'USER' | 'SUPER_ADMIN',
) {
  return db.user.upsert({
    where: { email },
    update: { name, passwordHash, systemRole, failedLoginCount: 0, lockedUntil: null, deletedAt: null },
    create: { email, name, passwordHash, systemRole, emailVerifiedAt: new Date() },
  });
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({ level: env.LOG_LEVEL, name: 'adpulse-seed' });
  if (env.NODE_ENV === 'production' && (!env.SEED_ADMIN_PASSWORD || !env.SEED_DEMO_PASSWORD)) {
    throw new Error('Refusing to seed production without SEED_ADMIN_PASSWORD and SEED_DEMO_PASSWORD');
  }
  const db = createPrismaClient();
  const now = new Date();

  try {
    logger.info('Removing previous demo organizations');
    await db.organization.deleteMany({ where: { slug: { in: [DEMO_ORG_SLUG, SECOND_ORG_SLUG] } } });

    const adminHash = await hashPassword(env.SEED_ADMIN_PASSWORD ?? DEV_ADMIN_PASSWORD);
    const demoHash = await hashPassword(env.SEED_DEMO_PASSWORD ?? DEV_DEMO_PASSWORD);
    const superAdmin = await upsertUser(
      db,
      env.SEED_ADMIN_EMAIL,
      'Platform Administrator',
      adminHash,
      'SUPER_ADMIN',
    );
    const members: { id: string; role: OrgRole }[] = [];
    for (const u of DEMO_USERS)
      members.push({ id: (await upsertUser(db, u.email, u.name, demoHash, 'USER')).id, role: u.role });
    const userFor = (role: OrgRole) => {
      const member = members.find((m) => m.role === role);
      if (!member) throw new Error(`Demo user for ${role} missing`);
      return member;
    };
    const orgAdmin = userFor('ORGANIZATION_ADMIN');
    const manager = userFor('MARKETING_MANAGER');
    const analyst = userFor('ANALYST');

    const org = await db.organization.create({
      data: {
        name: 'Northwind Outdoor Group',
        slug: DEMO_ORG_SLUG,
        currencyCode: 'USD',
        timezone: 'America/New_York',
        reportingPreferences: { ...DEFAULT_REPORTING_PREFERENCES },
        branding: {
          primaryColor: '#3949AB',
          logoUrl: null,
          reportFooter: 'Prepared by the Northwind performance team',
        },
        onboardingStep: 5,
        onboardingCompletedAt: now,
        memberships: { create: members.map((m) => ({ userId: m.id, role: m.role })) },
      },
    });

    const secondOwner = await upsertUser(db, 'owner@fabrikam.demo', 'Fabrikam Owner', demoHash, 'USER');
    await db.organization.create({
      data: {
        name: 'Fabrikam Retail',
        slug: SECOND_ORG_SLUG,
        currencyCode: 'EUR',
        timezone: 'Europe/Berlin',
        reportingPreferences: { ...DEFAULT_REPORTING_PREFERENCES },
        onboardingStep: 5,
        onboardingCompletedAt: now,
        memberships: {
          create: [
            { userId: secondOwner.id, role: 'ORGANIZATION_ADMIN' },
            { userId: orgAdmin.id, role: 'VIEWER' },
          ],
        },
      },
    });

    logger.info('Creating mock Google connections and accounts');
    const adsConnection = await db.oAuthConnection.create({
      data: {
        organizationId: org.id,
        provider: 'GOOGLE_ADS',
        isMock: true,
        externalEmail: 'ads-demo@northwind.demo',
        scopes: ['https://www.googleapis.com/auth/adwords'],
        connectedById: orgAdmin.id,
      },
    });
    const analyticsConnection = await db.oAuthConnection.create({
      data: {
        organizationId: org.id,
        provider: 'GOOGLE_ANALYTICS',
        isMock: true,
        externalEmail: 'analytics-demo@northwind.demo',
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
        connectedById: orgAdmin.id,
      },
    });
    await db.adAccount.create({
      data: {
        organizationId: org.id,
        connectionId: adsConnection.id,
        customerId: MOCK_MANAGER_ACCOUNT.customerId,
        name: MOCK_MANAGER_ACCOUNT.name,
        currencyCode: 'USD',
        timezone: 'America/New_York',
        isManager: true,
        isActive: false,
      },
    });
    const accounts = [];
    for (const def of MOCK_ACCOUNTS) {
      const account = await db.adAccount.create({
        data: {
          organizationId: org.id,
          connectionId: adsConnection.id,
          customerId: def.customerId,
          managerCustomerId: def.managerCustomerId,
          name: def.name,
          currencyCode: def.currencyCode,
          timezone: def.timezone,
        },
      });
      await db.analyticsProperty.create({
        data: {
          organizationId: org.id,
          connectionId: analyticsConnection.id,
          adAccountId: account.id,
          propertyId: mockPropertyId(def.customerId),
          name: `${def.name} (GA4)`,
          timezone: def.timezone,
        },
      });
      accounts.push(account);
    }
    const [ecommerce, leads] = accounts;
    if (!ecommerce || !leads) throw new Error('Mock accounts missing');

    logger.info('Creating targets and alert rules');
    const alerts = new AlertEvaluationService(db, logger);
    await alerts.ensureDefaultRules(org.id);
    const orgTargets = { CPA: 50, ROAS: 3, CTR: 1, CONVERSION_RATE: 2, SPEND_PACING_TOLERANCE: 15 } as const;
    for (const [metric, value] of Object.entries(orgTargets)) {
      await db.performanceTarget.create({
        data: {
          organizationId: org.id,
          scope: 'ORGANIZATION',
          scopeKey: targetScopeKey('ORGANIZATION'),
          metric: metric as keyof typeof orgTargets,
          value,
          updatedById: manager.id,
        },
      });
    }
    await db.performanceTarget.create({
      data: {
        organizationId: org.id,
        scope: 'AD_ACCOUNT',
        scopeKey: targetScopeKey('AD_ACCOUNT', leads.id),
        adAccountId: leads.id,
        metric: 'CPA',
        value: 60,
        updatedById: manager.id,
      },
    });

    logger.info({ days: env.INITIAL_SYNC_DAYS }, 'Importing mock history through the sync pipeline');
    const sync = new SyncService(
      db,
      new ProviderFactory(env),
      new EncryptionService(env.ENCRYPTION_KEY),
      logger,
    );
    const { jobs } = await planSyncJobs(db, {
      organizationId: org.id,
      type: 'INITIAL',
      triggeredById: orgAdmin.id,
      lookbackDays: env.SYNC_LOOKBACK_DAYS,
      initialDays: env.INITIAL_SYNC_DAYS,
      now,
    });
    for (const job of jobs) {
      if (!job.adAccountId) continue;
      const result = await sync.runAdsSync(job.id, { isFinalAttempt: true });
      const joined = await sync.runAnalyticsSync(org.id, job.adAccountId, {
        from: fromDbDate(job.rangeStart),
        to: fromDbDate(job.rangeEnd),
      });
      logger.info(
        { adAccountId: job.adAccountId, rows: result.rowsProcessed, ga4Rows: joined },
        'Account imported',
      );
    }

    const display = await db.campaign.findFirstOrThrow({
      where: { organizationId: org.id, externalId: '20005' },
    });
    await db.performanceTarget.create({
      data: {
        organizationId: org.id,
        scope: 'CAMPAIGN',
        scopeKey: targetScopeKey('CAMPAIGN', display.adAccountId, display.id),
        adAccountId: display.adAccountId,
        campaignId: display.id,
        metric: 'CTR',
        value: 0.5,
        updatedById: manager.id,
      },
    });
    await db.changeLog.create({
      data: {
        organizationId: org.id,
        entityType: 'CAMPAIGN',
        entityId: display.id,
        campaignId: display.id,
        field: 'target.CTR',
        oldValue: '1',
        newValue: '0.5',
        source: 'USER',
        changedById: manager.id,
      },
    });

    logger.info('Evaluating alerts and recommendations');
    const alertResult = await alerts.evaluate(org.id, now);
    const recResult = await new RecommendationService(db, logger).generate(org.id, now);
    logger.info({ alerts: alertResult.created, recommendations: recResult.created }, 'Insights generated');

    await seedSyncHistory(db, org.id, ecommerce.id, leads.id, adsConnection.id, orgAdmin.id, now);
    await seedWorkspace(db, org.id, { admin: orgAdmin.id, manager: manager.id, analyst: analyst.id }, now);
    await seedReports(db, env, logger, org.id, manager.id, ecommerce.timezone, now);

    for (const flag of [
      {
        key: 'ga4-integration',
        description: 'Google Analytics 4 enrichment of landing-page metrics',
        enabled: true,
      },
      {
        key: 'scheduled-reports',
        description: 'Automatic weekly and monthly report generation',
        enabled: true,
      },
      { key: 'kanban-board', description: 'Kanban view for optimization actions', enabled: true },
    ]) {
      await db.featureFlag.upsert({ where: { key: flag.key }, update: flag, create: flag });
    }

    await recordAudit(
      db,
      { actorId: superAdmin.id, organizationId: org.id },
      { action: 'seed.completed', entityType: 'Organization', entityId: org.id },
    );
    logger.info({ organization: org.slug }, 'Seed completed');
  } finally {
    await db.$disconnect();
  }
}

async function seedSyncHistory(
  db: PrismaClient,
  organizationId: string,
  ecommerceId: string,
  leadsId: string,
  connectionId: string,
  triggeredById: string,
  now: Date,
): Promise<void> {
  const today = isoDateInTimezone(now, 'America/New_York');
  for (let day = 7; day >= 1; day -= 1) {
    for (const adAccountId of [ecommerceId, leadsId]) {
      const started = new Date(now.getTime() - day * 24 * HOURS);
      await db.syncJob.create({
        data: {
          organizationId,
          adAccountId,
          connectionId,
          provider: 'GOOGLE_ADS',
          type: 'INCREMENTAL',
          status: 'SUCCEEDED',
          rangeStart: dbDate(addDays(today, -day - 3)),
          rangeEnd: dbDate(addDays(today, -day - 1)),
          rowsProcessed: 4200 + day * 37,
          progress: 100,
          startedAt: started,
          finishedAt: new Date(started.getTime() + 95_000),
          createdAt: started,
        },
      });
    }
  }
  const failedAt = new Date(now.getTime() - 3 * 24 * HOURS + 2 * HOURS);
  const failed = await db.syncJob.create({
    data: {
      organizationId,
      adAccountId: leadsId,
      connectionId,
      provider: 'GOOGLE_ADS',
      type: 'MANUAL',
      status: 'FAILED',
      rangeStart: dbDate(addDays(today, -5)),
      rangeEnd: dbDate(addDays(today, -4)),
      triggeredById,
      startedAt: failedAt,
      finishedAt: new Date(failedAt.getTime() + 12_000),
      createdAt: failedAt,
    },
  });
  await db.syncError.create({
    data: {
      organizationId,
      syncJobId: failed.id,
      code: 'RATE_LIMITED',
      message: 'RESOURCE_EXHAUSTED: Too many requests. Retry in 30 seconds.',
      retryable: true,
      details: { status: 429, final: true },
      createdAt: failedAt,
    },
  });
}

async function seedWorkspace(
  db: PrismaClient,
  organizationId: string,
  people: { admin: string; manager: string; analyst: string },
  now: Date,
): Promise<void> {
  const recs = await db.recommendation.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
  const alerts = await db.alert.findMany({
    where: { organizationId, status: 'OPEN' },
    orderBy: { severity: 'desc' },
  });
  const campaigns = await db.campaign.findMany({ where: { organizationId } });
  const byExternal = (id: string) => campaigns.find((c) => c.externalId === id) ?? null;
  const day = (offset: number) => dbDate(addDays(isoDateInTimezone(now, 'America/New_York'), offset));

  const firstAlert = alerts[0];
  if (firstAlert) {
    await db.alert.update({
      where: { id: firstAlert.id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: now, assigneeId: people.analyst },
    });
  }

  const approved = recs.find((r) => r.type === 'NEGATIVE_KEYWORD_CANDIDATES');
  const scaling = recs.find((r) => r.type === 'CONTROLLED_BUDGET_SCALING');
  const dismissed = recs.find((r) => r.type === 'REVIEW_LOCATION_PERFORMANCE');
  if (approved) {
    await db.recommendation.update({
      where: { id: approved.id },
      data: { status: 'CONVERTED', decidedById: people.manager, decidedAt: now },
    });
  }
  if (dismissed) {
    await db.recommendation.update({
      where: { id: dismissed.id },
      data: {
        status: 'DISMISSED',
        dismissalReason: 'Location mix is driven by a regional promotion this month; revisit next month.',
        decidedById: people.manager,
        decidedAt: now,
      },
    });
  }

  const generic = byExternal('20002');
  const pmax = byExternal('20008');
  const tents = byExternal('20004');
  const repair = byExternal('21002');
  const quote = byExternal('21005');

  const actions: Prisma.OptimizationActionUncheckedCreateInput[] = [
    {
      organizationId,
      title: 'Add negative keywords for non-converting generic queries',
      description:
        'Review the flagged search terms and add confirmed irrelevant queries as negatives in Google Ads.',
      hypothesis: 'Removing irrelevant traffic lowers CPA without reducing conversions.',
      expectedImpact: 'CPA −10% within two weeks',
      campaignId: generic?.id ?? null,
      adAccountId: generic?.adAccountId ?? null,
      metricToMonitor: 'cpa',
      baselineValue: new Prisma.Decimal(58.4),
      targetValue: new Prisma.Decimal(50),
      ownerId: people.analyst,
      createdById: people.manager,
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      plannedDate: day(-3),
      recommendationId: approved?.id ?? null,
    },
    {
      organizationId,
      title: 'Test a 15% budget increase on Premium Tents',
      hypothesis:
        'The campaign is budget-limited at strong ROAS; a controlled increase should add volume at acceptable ROAS.',
      expectedImpact: '+15% conversion value at ROAS ≥ 4.0x',
      campaignId: tents?.id ?? null,
      adAccountId: tents?.adAccountId ?? null,
      metricToMonitor: 'roas',
      baselineValue: new Prisma.Decimal(5.2),
      targetValue: new Prisma.Decimal(4),
      ownerId: people.manager,
      createdById: people.manager,
      priority: 'MEDIUM',
      status: 'PLANNED',
      plannedDate: day(2),
      evaluationDate: day(16),
      recommendationId: scaling?.id ?? null,
    },
    {
      organizationId,
      title: 'Audit conversion tracking on Emergency Repair landing page',
      description: 'Spend continues with no recorded conversions. Verify the call-tracking and form tags.',
      campaignId: repair?.id ?? null,
      adAccountId: repair?.adAccountId ?? null,
      metricToMonitor: 'conversions',
      ownerId: people.admin,
      createdById: people.analyst,
      priority: 'URGENT',
      status: 'BACKLOG',
      alertId: alerts.find((a) => a.type === 'HIGH_SPEND_ZERO_CONVERSIONS')?.id ?? null,
    },
    {
      organizationId,
      title: 'Rewrite /quote page headline to match ad copy',
      hypothesis: 'Message mismatch between ads and landing page correlates with the high bounce rate.',
      campaignId: quote?.id ?? null,
      adAccountId: quote?.adAccountId ?? null,
      metricToMonitor: 'conversionRate',
      baselineValue: new Prisma.Decimal(3.1),
      targetValue: new Prisma.Decimal(4),
      actualValue: new Prisma.Decimal(3.6),
      ownerId: people.analyst,
      createdById: people.manager,
      priority: 'MEDIUM',
      status: 'COMPLETED',
      plannedDate: day(-20),
      completedAt: new Date(now.getTime() - 6 * 24 * HOURS),
      evaluationDate: day(8),
    },
    {
      organizationId,
      title: 'Consolidate PMax asset groups',
      hypothesis: 'Fewer, better-performing asset groups improve learning and CPA.',
      campaignId: pmax?.id ?? null,
      adAccountId: pmax?.adAccountId ?? null,
      metricToMonitor: 'cpa',
      baselineValue: new Prisma.Decimal(72),
      targetValue: new Prisma.Decimal(55),
      actualValue: new Prisma.Decimal(61.5),
      ownerId: people.manager,
      createdById: people.manager,
      priority: 'HIGH',
      status: 'EVALUATED',
      plannedDate: day(-45),
      completedAt: new Date(now.getTime() - 35 * 24 * HOURS),
      evaluationDate: day(-21),
      actualResult:
        'CPA improved from $72.00 to $61.50 over 14 days; still above the $55 target. Seasonality may have contributed.',
      resultClassification: 'POSITIVE',
    },
    {
      organizationId,
      title: 'Pause competitor-term ad group',
      campaignId: byExternal('21003')?.id ?? null,
      adAccountId: byExternal('21003')?.adAccountId ?? null,
      ownerId: people.manager,
      createdById: people.analyst,
      priority: 'LOW',
      status: 'CANCELLED',
      cancellationReason: 'Legal review approved competitor bidding; keep running and monitor CPA instead.',
    },
  ];

  for (const data of actions) {
    const action = await db.optimizationAction.create({ data });
    await db.actionComment.create({
      data: {
        organizationId,
        actionId: action.id,
        authorId: people.manager,
        body: `Created from the weekly performance review. Owner please update the status as work progresses.`,
      },
    });
  }

  const reviewed = await db.searchTerm.findMany({
    where: { organizationId },
    take: 3,
    orderBy: { term: 'asc' },
  });
  for (const term of reviewed) {
    await db.searchTerm.update({
      where: { id: term.id },
      data: {
        reviewedAt: now,
        reviewedById: people.analyst,
        reviewNote: 'Reviewed — relevant intent, keep.',
      },
    });
  }
}

async function seedReports(
  db: PrismaClient,
  env: AppEnv,
  logger: Logger,
  organizationId: string,
  requestedById: string,
  timezone: string,
  now: Date,
): Promise<void> {
  const sections = REPORT_SECTIONS.map((s) => s.key);
  const weekly = await db.reportTemplate.create({
    data: {
      organizationId,
      name: 'Weekly performance report',
      description: 'Every Monday: previous Monday–Sunday performance for all accounts.',
      frequency: 'WEEKLY',
      sections,
      isDefault: true,
      scheduleEnabled: true,
      recipients: ['manager@northwind.demo'],
    },
  });
  await db.reportTemplate.create({
    data: {
      organizationId,
      name: 'Monthly executive report',
      description: 'On the 1st: previous calendar month for leadership.',
      frequency: 'MONTHLY',
      sections,
      scheduleEnabled: true,
      recipients: ['admin@northwind.demo'],
    },
  });

  const yesterday = addDays(isoDateInTimezone(now, timezone), -1);
  const storage = createStorageProvider(env);
  const pdf = new PuppeteerPdfRenderer(env.PUPPETEER_EXECUTABLE_PATH);
  const generator = new ReportGenerationService(db, storage, pdf, logger);
  try {
    for (const format of ['EXCEL', 'PDF'] as const) {
      const report = await db.generatedReport.create({
        data: {
          organizationId,
          templateId: weekly.id,
          title: `Weekly performance report · ${addDays(yesterday, -6)} – ${yesterday}`,
          frequency: 'WEEKLY',
          format,
          periodStart: dbDate(addDays(yesterday, -6)),
          periodEnd: dbDate(yesterday),
          commentary:
            'Spend was stable week over week. Generic hiking-boot CPCs continue to rise; see the open action.',
          requestedById,
          idempotencyKey: `seed-weekly-${format}`,
        },
      });
      try {
        await generator.run(report.id, { isFinalAttempt: true });
      } catch (error) {
        logger.warn(
          { format, err: { message: (error as Error).message } },
          'Seed report generation failed; record kept as FAILED',
        );
      }
    }
  } finally {
    await pdf.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Seed failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
