import { dbDate, fromDbDate, Prisma, type PrismaClient } from '@adpulse/database';
import type { DateRange } from '@adpulse/types';
import type { EncryptionService } from '../crypto/encryption';
import { ProviderError } from '../errors';
import { type Logger, redactSecrets } from '../logger';
import type { ProviderFactory } from '../providers/factory';
import type {
  AdsAccountContext,
  AdsProvider,
  ProviderEntities,
  ReportRowMap,
  ReportType,
} from '../providers/types';
import { REPORT_TYPES } from '../providers/types';
import {
  aggregateRows,
  inferObjective,
  mapChannelType,
  mapDevice,
  mapMatchType,
  mapStatus,
  microsToDecimal,
  normalizePath,
  normalizeUrl,
  shareToDecimal,
  splitRange,
  toDbMetrics,
} from './mapping';

const CHUNK_DAYS = 14;
const INSERT_BATCH = 5000;
const TX_OPTIONS = { timeout: 180_000, maxWait: 30_000 };

interface EntityMaps {
  organizationId: string;
  adAccountId: string;
  currencyCode: string;
  campaigns: Map<string, string>;
  adGroups: Map<string, { id: string; campaignId: string }>;
  keywords: Map<string, string>;
}

export interface SyncRunResult {
  rowsProcessed: number;
  skippedRows: number;
}

async function collect<T>(iterable: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const page of iterable) out.push(...page);
  return out;
}

async function insertBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) await insert(rows.slice(i, i + INSERT_BATCH));
}

export class SyncService {
  constructor(
    private readonly db: PrismaClient,
    private readonly providers: ProviderFactory,
    private readonly encryption: EncryptionService,
    private readonly logger: Logger,
  ) {}

  private decryptToken(connection: { id: string; encryptedRefreshToken: string | null }): string | null {
    return connection.encryptedRefreshToken
      ? this.encryption.decrypt(connection.encryptedRefreshToken, connection.id)
      : null;
  }

  /**
   * Executes a Google Ads (or mock) sync job. Metric tables use a replace-window strategy: each date chunk
   * is deleted and re-inserted inside one transaction, which makes re-runs idempotent and picks up
   * late conversion adjustments.
   */
  async runAdsSync(
    syncJobId: string,
    options: { isFinalAttempt: boolean; onProgress?: (percent: number) => Promise<void> },
  ): Promise<SyncRunResult> {
    const job = await this.db.syncJob.findUnique({
      where: { id: syncJobId },
      include: { adAccount: { include: { connection: true } }, connection: true },
    });
    if (!job?.adAccount)
      throw new ProviderError(`Sync job ${syncJobId} has no ad account`, 'NOT_FOUND', false);
    if (job.status === 'SUCCEEDED') return { rowsProcessed: job.rowsProcessed, skippedRows: 0 };

    const account = job.adAccount;
    const connection = job.connection ?? account.connection;
    const log = this.logger.child({ syncJobId, organizationId: job.organizationId, adAccountId: account.id });
    await this.db.syncJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING', startedAt: new Date(), progress: 0 },
    });

    try {
      if (!connection || connection.status === 'REVOKED') {
        throw new ProviderError('The Google Ads connection has been disconnected', 'AUTH', false, 401);
      }
      const provider = this.providers.ads(connection);
      const context: AdsAccountContext = {
        customerId: account.customerId,
        loginCustomerId: account.managerCustomerId,
        refreshToken: this.decryptToken(connection),
      };

      const entities = await provider.fetchEntities(context);
      const maps = await this.upsertEntities(job.organizationId, account.id, account.currencyCode, entities);

      const chunks = splitRange(fromDbDate(job.rangeStart), fromDbDate(job.rangeEnd), CHUNK_DAYS);
      const totalSteps = chunks.length * REPORT_TYPES.length;
      let step = 0;
      let rowsProcessed = 0;
      let skippedRows = 0;
      for (const chunk of chunks) {
        for (const report of REPORT_TYPES) {
          const result = await this.syncReport(provider, context, maps, report, chunk);
          rowsProcessed += result.inserted;
          skippedRows += result.skipped;
          step += 1;
          const progress = Math.round((step / totalSteps) * 95);
          await this.db.syncJob.update({ where: { id: job.id }, data: { progress, rowsProcessed } });
          await options.onProgress?.(progress);
        }
        await this.aggregateAccountMetrics(job.organizationId, account.id, chunk);
      }

      const now = new Date();
      await this.db.$transaction([
        this.db.syncJob.update({
          where: { id: job.id },
          data: { status: 'SUCCEEDED', progress: 100, rowsProcessed, finishedAt: now },
        }),
        this.db.adAccount.update({ where: { id: account.id }, data: { lastSyncedAt: now } }),
        this.db.oAuthConnection.update({
          where: { id: connection.id },
          data: { lastSuccessfulSyncAt: now, lastError: null, status: 'ACTIVE' },
        }),
      ]);
      if (skippedRows > 0) log.warn({ skippedRows }, 'Rows referenced unknown entities and were skipped');
      log.info({ rowsProcessed }, 'Ads sync completed');
      return { rowsProcessed, skippedRows };
    } catch (error) {
      await this.recordFailure(
        job.id,
        job.organizationId,
        connection?.id ?? null,
        error,
        options.isFinalAttempt,
      );
      log.error({ err: { message: redactSecrets((error as Error).message) } }, 'Ads sync failed');
      throw error;
    }
  }

  private async recordFailure(
    syncJobId: string,
    organizationId: string,
    connectionId: string | null,
    error: unknown,
    isFinalAttempt: boolean,
  ): Promise<void> {
    const providerError = error instanceof ProviderError ? error : null;
    const retryable = providerError?.retryable ?? false;
    const message = redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 2000);
    const terminal = isFinalAttempt || !retryable;
    await this.db.$transaction(async (tx) => {
      await tx.syncError.create({
        data: {
          organizationId,
          syncJobId,
          code: providerError?.code ?? 'INTERNAL',
          message,
          retryable,
          details: { status: providerError?.status ?? null, final: terminal },
        },
      });
      await tx.syncJob.update({
        where: { id: syncJobId },
        data: terminal ? { status: 'FAILED', finishedAt: new Date() } : { status: 'QUEUED' },
      });
      if (
        connectionId &&
        providerError &&
        (providerError.isAuthError || providerError.code === 'PERMISSION')
      ) {
        await tx.oAuthConnection.update({
          where: { id: connectionId },
          data: { status: 'NEEDS_ATTENTION', lastError: message },
        });
      } else if (connectionId && terminal) {
        await tx.oAuthConnection.update({ where: { id: connectionId }, data: { lastError: message } });
      }
    });
  }

  private async upsertEntities(
    organizationId: string,
    adAccountId: string,
    currencyCode: string,
    entities: ProviderEntities,
  ): Promise<EntityMaps> {
    const existing = await this.db.campaign.findMany({ where: { organizationId, adAccountId } });
    const byExternal = new Map(existing.map((c) => [c.externalId, c]));
    const campaigns = new Map<string, string>();

    for (const c of entities.campaigns) {
      const channelType = mapChannelType(c.channelType);
      const status = mapStatus(c.status);
      const dailyBudget = c.budgetMicros ? microsToDecimal(c.budgetMicros) : null;
      const prior = byExternal.get(c.campaignId);
      if (!prior) {
        const created = await this.db.campaign.create({
          data: {
            organizationId,
            adAccountId,
            externalId: c.campaignId,
            name: c.name,
            status,
            channelType,
            objective: inferObjective(channelType, c.name, c.objectiveHint),
            dailyBudget,
            startDate: c.startDate ? dbDate(c.startDate) : null,
          },
        });
        campaigns.set(c.campaignId, created.id);
        continue;
      }
      campaigns.set(c.campaignId, prior.id);
      const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
      if (prior.name !== c.name) changes.push({ field: 'name', oldValue: prior.name, newValue: c.name });
      if (prior.status !== status)
        changes.push({ field: 'status', oldValue: prior.status, newValue: status });
      const oldBudget = prior.dailyBudget?.toFixed(2) ?? null;
      const newBudget = dailyBudget?.toFixed(2) ?? null;
      if (oldBudget !== newBudget)
        changes.push({ field: 'dailyBudget', oldValue: oldBudget, newValue: newBudget });
      if (changes.length > 0) {
        await this.db.$transaction([
          this.db.campaign.update({
            where: { id: prior.id },
            data: { name: c.name, status, dailyBudget, channelType },
          }),
          this.db.changeLog.createMany({
            data: changes.map((ch) => ({
              organizationId,
              entityType: 'CAMPAIGN' as const,
              entityId: prior.id,
              campaignId: prior.id,
              source: 'SYNC' as const,
              ...ch,
            })),
          }),
        ]);
      }
    }

    const adGroups = new Map<string, { id: string; campaignId: string }>();
    for (const g of entities.adGroups) {
      const campaignId = campaigns.get(g.campaignId);
      if (!campaignId) continue;
      const row = await this.db.adGroup.upsert({
        where: { campaignId_externalId: { campaignId, externalId: g.adGroupId } },
        create: {
          organizationId,
          adAccountId,
          campaignId,
          externalId: g.adGroupId,
          name: g.name,
          status: mapStatus(g.status),
        },
        update: { name: g.name, status: mapStatus(g.status) },
        select: { id: true },
      });
      adGroups.set(g.adGroupId, { id: row.id, campaignId });
    }

    const keywords = new Map<string, string>();
    for (const k of entities.keywords) {
      const group = adGroups.get(k.adGroupId);
      if (!group) continue;
      const row = await this.db.keyword.upsert({
        where: { adGroupId_externalId: { adGroupId: group.id, externalId: k.criterionId } },
        create: {
          organizationId,
          adAccountId,
          campaignId: group.campaignId,
          adGroupId: group.id,
          externalId: k.criterionId,
          text: k.text,
          matchType: mapMatchType(k.matchType),
          status: mapStatus(k.status),
          qualityScore: k.qualityScore,
        },
        update: {
          text: k.text,
          matchType: mapMatchType(k.matchType),
          status: mapStatus(k.status),
          qualityScore: k.qualityScore,
        },
        select: { id: true },
      });
      keywords.set(`${k.adGroupId}~${k.criterionId}`, row.id);
    }

    return { organizationId, adAccountId, currencyCode, campaigns, adGroups, keywords };
  }

  private async syncReport(
    provider: AdsProvider,
    context: AdsAccountContext,
    maps: EntityMaps,
    report: ReportType,
    range: DateRange,
  ): Promise<{ inserted: number; skipped: number }> {
    const rows = await collect(provider.streamReport(context, report, range));
    const scope = {
      organizationId: maps.organizationId,
      adAccountId: maps.adAccountId,
      currencyCode: maps.currencyCode,
    };
    const dateFilter = { gte: dbDate(range.from), lte: dbDate(range.to) };
    const where = { organizationId: maps.organizationId, adAccountId: maps.adAccountId, date: dateFilter };
    let skipped = 0;
    const campaignOf = (externalId: string) => {
      const id = maps.campaigns.get(externalId);
      if (!id) skipped += 1;
      return id;
    };

    switch (report) {
      case 'campaign': {
        const data = (rows as ReportRowMap['campaign'][]).flatMap((r) => {
          const campaignId = campaignOf(r.campaignId);
          if (!campaignId) return [];
          return [
            {
              ...scope,
              campaignId,
              date: dbDate(r.date),
              ...toDbMetrics(r),
              searchImpressionShare: shareToDecimal(r.searchImpressionShare),
              searchTopImpressionShare: shareToDecimal(r.searchTopImpressionShare),
              searchAbsoluteTopImpressionShare: shareToDecimal(r.searchAbsoluteTopImpressionShare),
              searchBudgetLostImpressionShare: shareToDecimal(r.searchBudgetLostImpressionShare),
            },
          ];
        });
        await this.db.$transaction(async (tx) => {
          await tx.campaignDailyMetric.deleteMany({ where });
          await insertBatches(data, (batch) => tx.campaignDailyMetric.createMany({ data: batch }));
        }, TX_OPTIONS);
        return { inserted: data.length, skipped };
      }
      case 'ad_group': {
        const data = (rows as ReportRowMap['ad_group'][]).flatMap((r) => {
          const group = maps.adGroups.get(r.adGroupId);
          if (!group) {
            skipped += 1;
            return [];
          }
          return [
            {
              ...scope,
              campaignId: group.campaignId,
              adGroupId: group.id,
              date: dbDate(r.date),
              ...toDbMetrics(r),
            },
          ];
        });
        await this.db.$transaction(async (tx) => {
          await tx.adGroupDailyMetric.deleteMany({ where });
          await insertBatches(data, (batch) => tx.adGroupDailyMetric.createMany({ data: batch }));
        }, TX_OPTIONS);
        return { inserted: data.length, skipped };
      }
      case 'keyword': {
        const data = (rows as ReportRowMap['keyword'][]).flatMap((r) => {
          const group = maps.adGroups.get(r.adGroupId);
          const keywordId = maps.keywords.get(`${r.adGroupId}~${r.criterionId}`);
          if (!group || !keywordId) {
            skipped += 1;
            return [];
          }
          return [
            {
              ...scope,
              campaignId: group.campaignId,
              adGroupId: group.id,
              keywordId,
              date: dbDate(r.date),
              qualityScore: r.qualityScore,
              ...toDbMetrics(r),
            },
          ];
        });
        await this.db.$transaction(async (tx) => {
          await tx.keywordDailyMetric.deleteMany({ where });
          await insertBatches(data, (batch) => tx.keywordDailyMetric.createMany({ data: batch }));
        }, TX_OPTIONS);
        return { inserted: data.length, skipped };
      }
      case 'search_term':
        return this.syncSearchTerms(rows as ReportRowMap['search_term'][], maps, scope, where);
      case 'device': {
        const merged = aggregateRows(rows as ReportRowMap['device'][], (r) =>
          campaignOf(r.campaignId) ? `${r.campaignId}|${r.date}|${mapDevice(r.device)}` : null,
        );
        const data = [...merged.values()].map((r) => ({
          ...scope,
          campaignId: maps.campaigns.get(r.campaignId) as string,
          date: dbDate(r.date),
          device: mapDevice(r.device),
          ...toDbMetrics(r),
        }));
        await this.db.$transaction(async (tx) => {
          await tx.deviceDailyMetric.deleteMany({ where });
          await insertBatches(data, (batch) => tx.deviceDailyMetric.createMany({ data: batch }));
        }, TX_OPTIONS);
        return { inserted: data.length, skipped };
      }
      case 'geo': {
        const merged = aggregateRows(rows as ReportRowMap['geo'][], (r) =>
          campaignOf(r.campaignId) && r.locationId
            ? `${r.campaignId}|${r.date}|${r.locationId}|${mapDevice(r.device)}`
            : null,
        );
        const data = [...merged.values()].map((r) => ({
          ...scope,
          campaignId: maps.campaigns.get(r.campaignId) as string,
          date: dbDate(r.date),
          locationId: r.locationId,
          locationName: r.locationName,
          countryCode: r.countryCode.slice(0, 2).toUpperCase().padEnd(2, 'Z'),
          device: mapDevice(r.device),
          ...toDbMetrics(r),
        }));
        await this.db.$transaction(async (tx) => {
          await tx.locationDailyMetric.deleteMany({ where });
          await insertBatches(data, (batch) => tx.locationDailyMetric.createMany({ data: batch }));
        }, TX_OPTIONS);
        return { inserted: data.length, skipped };
      }
      case 'landing_page':
        return this.syncLandingPages(rows as ReportRowMap['landing_page'][], maps, scope, where);
    }
  }

  private async syncSearchTerms(
    rows: ReportRowMap['search_term'][],
    maps: EntityMaps,
    scope: { organizationId: string; adAccountId: string; currencyCode: string },
    where: Prisma.SearchTermDailyMetricWhereInput,
  ): Promise<{ inserted: number; skipped: number }> {
    let skipped = 0;
    const merged = aggregateRows(rows, (r) => {
      if (!maps.adGroups.has(r.adGroupId) || !r.searchTerm) {
        skipped += 1;
        return null;
      }
      return `${r.adGroupId}|${r.searchTerm.toLowerCase()}|${r.date}`;
    });

    const termKeys = new Map<string, { adGroupExternal: string; term: string; criterionId: string | null }>();
    for (const r of merged.values()) {
      termKeys.set(`${r.adGroupId}|${r.searchTerm.toLowerCase()}`, {
        adGroupExternal: r.adGroupId,
        term: r.searchTerm.toLowerCase(),
        criterionId: r.criterionId,
      });
    }
    const termData = [...termKeys.values()].map((t) => {
      const group = maps.adGroups.get(t.adGroupExternal) as { id: string; campaignId: string };
      return {
        organizationId: scope.organizationId,
        adAccountId: scope.adAccountId,
        campaignId: group.campaignId,
        adGroupId: group.id,
        keywordId: t.criterionId
          ? (maps.keywords.get(`${t.adGroupExternal}~${t.criterionId}`) ?? null)
          : null,
        term: t.term,
      };
    });
    await insertBatches(termData, (batch) =>
      this.db.searchTerm.createMany({ data: batch, skipDuplicates: true }),
    );
    const terms = await this.db.searchTerm.findMany({
      where: { organizationId: scope.organizationId, adAccountId: scope.adAccountId },
      select: { id: true, adGroupId: true, term: true },
    });
    const termIds = new Map(terms.map((t) => [`${t.adGroupId}|${t.term}`, t.id]));

    const data = [...merged.values()].flatMap((r) => {
      const group = maps.adGroups.get(r.adGroupId) as { id: string; campaignId: string };
      const searchTermId = termIds.get(`${group.id}|${r.searchTerm.toLowerCase()}`);
      if (!searchTermId) return [];
      return [
        {
          ...scope,
          campaignId: group.campaignId,
          adGroupId: group.id,
          searchTermId,
          date: dbDate(r.date),
          ...toDbMetrics(r),
        },
      ];
    });
    await this.db.$transaction(async (tx) => {
      await tx.searchTermDailyMetric.deleteMany({ where });
      await insertBatches(data, (batch) => tx.searchTermDailyMetric.createMany({ data: batch }));
    }, TX_OPTIONS);
    return { inserted: data.length, skipped };
  }

  private async syncLandingPages(
    rows: ReportRowMap['landing_page'][],
    maps: EntityMaps,
    scope: { organizationId: string; adAccountId: string; currencyCode: string },
    where: Prisma.LandingPageDailyMetricWhereInput,
  ): Promise<{ inserted: number; skipped: number }> {
    let skipped = 0;
    const merged = aggregateRows(rows, (r) => {
      if (!maps.campaigns.has(r.campaignId) || !r.url) {
        skipped += 1;
        return null;
      }
      return `${r.campaignId}|${normalizeUrl(r.url)}|${r.date}`;
    });
    const urls = [...new Set([...merged.values()].map((r) => normalizeUrl(r.url)))];
    await this.db.landingPage.createMany({
      data: urls.map((url) => ({ organizationId: scope.organizationId, url })),
      skipDuplicates: true,
    });
    const pages = await this.db.landingPage.findMany({
      where: { organizationId: scope.organizationId, url: { in: urls } },
      select: { id: true, url: true },
    });
    const pageIds = new Map(pages.map((p) => [p.url, p.id]));
    const data = [...merged.values()].map((r) => ({
      ...scope,
      campaignId: maps.campaigns.get(r.campaignId) as string,
      landingPageId: pageIds.get(normalizeUrl(r.url)) as string,
      date: dbDate(r.date),
      ...toDbMetrics(r),
    }));
    await this.db.$transaction(async (tx) => {
      await tx.landingPageDailyMetric.deleteMany({ where });
      await insertBatches(data, (batch) => tx.landingPageDailyMetric.createMany({ data: batch }));
    }, TX_OPTIONS);
    return { inserted: data.length, skipped };
  }

  /**
   * Joins GA4 landing-page sessions onto Ads landing-page rows by (date, campaign, normalized path).
   * Rows GA4 cannot attribute to a campaign stay `analyticsJoined = false` with null session metrics.
   */
  async runAnalyticsSync(organizationId: string, adAccountId: string, range: DateRange): Promise<number> {
    const property = await this.db.analyticsProperty.findFirst({
      where: { organizationId, adAccountId },
      include: { connection: true },
    });
    if (!property?.connection || property.connection.status === 'REVOKED') return 0;

    const provider = this.providers.analytics(property.connection);
    const analyticsRows = await collect(
      provider.streamLandingPages(
        { propertyId: property.propertyId, refreshToken: this.decryptToken(property.connection) },
        range,
      ),
    );

    const campaigns = await this.db.campaign.findMany({
      where: { organizationId, adAccountId },
      select: { id: true, externalId: true },
    });
    const campaignIds = new Map(campaigns.map((c) => [c.externalId, c.id]));

    const sessions = new Map<string, { sessions: number; engaged: number; keyEvents: number }>();
    for (const r of analyticsRows) {
      const campaignId = r.googleAdsCampaignId ? campaignIds.get(r.googleAdsCampaignId) : undefined;
      if (!campaignId) continue;
      const key = `${r.date}|${campaignId}|${normalizePath(r.landingPage)}`;
      const acc = sessions.get(key) ?? { sessions: 0, engaged: 0, keyEvents: 0 };
      acc.sessions += r.sessions;
      acc.engaged += r.engagedSessions;
      acc.keyEvents += r.keyEvents;
      sessions.set(key, acc);
    }

    const adsRows = await this.db.landingPageDailyMetric.findMany({
      where: { organizationId, adAccountId, date: { gte: dbDate(range.from), lte: dbDate(range.to) } },
      select: { id: true, date: true, campaignId: true, landingPage: { select: { url: true } } },
    });
    const updates = adsRows.flatMap((row) => {
      const match = sessions.get(
        `${fromDbDate(row.date)}|${row.campaignId}|${normalizePath(row.landingPage.url)}`,
      );
      return match ? [{ id: row.id, ...match }] : [];
    });

    for (let i = 0; i < updates.length; i += 1000) {
      const chunk = updates.slice(i, i + 1000);
      const values = Prisma.join(
        chunk.map(
          (u) =>
            Prisma.sql`(${u.id}, ${u.sessions}::int, ${u.engaged}::int, ${u.keyEvents.toFixed(6)}::numeric)`,
        ),
      );
      await this.db.$executeRaw`
        UPDATE "LandingPageDailyMetric" AS m
        SET "sessions" = v.sessions, "engagedSessions" = v.engaged, "keyEvents" = v.key_events,
            "analyticsJoined" = TRUE, "updatedAt" = NOW()
        FROM (VALUES ${values}) AS v(id, sessions, engaged, key_events)
        WHERE m."id" = v.id`;
    }
    return updates.length;
  }

  /** Rebuilds the account-level daily rollup from campaign metrics for the given window. */
  async aggregateAccountMetrics(
    organizationId: string,
    adAccountId: string | undefined,
    range: DateRange,
  ): Promise<number> {
    const accountFilter = adAccountId ? Prisma.sql`AND "adAccountId" = ${adAccountId}` : Prisma.empty;
    const [, inserted] = await this.db.$transaction([
      this.db.$executeRaw`
        DELETE FROM "AccountDailyMetric"
        WHERE "organizationId" = ${organizationId} ${accountFilter}
          AND "date" BETWEEN ${range.from}::date AND ${range.to}::date`,
      this.db.$executeRaw`
        INSERT INTO "AccountDailyMetric"
          ("id", "organizationId", "adAccountId", "date", "impressions", "clicks", "cost", "conversions", "conversionValue", "currencyCode", "updatedAt")
        SELECT gen_random_uuid()::text, "organizationId", "adAccountId", "date",
          SUM("impressions"), SUM("clicks"), SUM("cost"), SUM("conversions"), SUM("conversionValue"), MIN("currencyCode"), NOW()
        FROM "CampaignDailyMetric"
        WHERE "organizationId" = ${organizationId} ${accountFilter}
          AND "date" BETWEEN ${range.from}::date AND ${range.to}::date
        GROUP BY "organizationId", "adAccountId", "date"`,
    ]);
    return inserted;
  }
}
