import { type PrismaClient } from '@adpulse/database';
import type { Logger } from '../logger';
import type { StorageProvider } from '../storage/storage';

const DAY = 86_400_000;

export interface CleanupResult {
  sessions: number;
  tokens: number;
  invitations: number;
  metricRows: number;
  reports: number;
  auditLogs: number;
}

/** Enforces retention: expired credentials, metric history beyond each organization's retention, old artifacts. */
export class CleanupService {
  constructor(
    private readonly db: PrismaClient,
    private readonly storage: StorageProvider,
    private readonly logger: Logger,
  ) {}

  async run(now = new Date(), reportRetentionDays = 180): Promise<CleanupResult> {
    const [sessions, verifications, resets, invitations] = await Promise.all([
      this.db.userSession.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 30 * DAY) } }],
        },
      }),
      this.db.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.db.organizationInvitation.deleteMany({
        where: { acceptedAt: null, expiresAt: { lt: new Date(now.getTime() - 30 * DAY) } },
      }),
    ]);

    let metricRows = 0;
    let auditLogs = 0;
    const orgs = await this.db.organization.findMany({ select: { id: true, dataRetentionDays: true } });
    for (const org of orgs) {
      const cutoff = new Date(now.getTime() - org.dataRetentionDays * DAY);
      const where = { organizationId: org.id, date: { lt: cutoff } };
      const results = await this.db.$transaction([
        this.db.searchTermDailyMetric.deleteMany({ where }),
        this.db.keywordDailyMetric.deleteMany({ where }),
        this.db.adGroupDailyMetric.deleteMany({ where }),
        this.db.locationDailyMetric.deleteMany({ where }),
        this.db.deviceDailyMetric.deleteMany({ where }),
        this.db.landingPageDailyMetric.deleteMany({ where }),
        this.db.campaignDailyMetric.deleteMany({ where }),
        this.db.accountDailyMetric.deleteMany({ where }),
      ]);
      metricRows += results.reduce((s, r) => s + r.count, 0);

      // Audit rows are append-only; deletion is permitted only inside this flagged transaction (see migration trigger).
      const [, purged] = await this.db.$transaction([
        this.db.$executeRaw`SELECT set_config('adpulse.audit_purge', 'on', true)`,
        this.db
          .$executeRaw`DELETE FROM "AuditLog" WHERE "organizationId" = ${org.id} AND "createdAt" < ${cutoff}`,
      ]);
      auditLogs += purged;
    }

    const oldReports = await this.db.generatedReport.findMany({
      where: { createdAt: { lt: new Date(now.getTime() - reportRetentionDays * DAY) } },
      select: { id: true, storageKey: true },
    });
    for (const r of oldReports) {
      if (r.storageKey) await this.storage.delete(r.storageKey).catch(() => undefined);
    }
    await this.db.generatedReport.deleteMany({ where: { id: { in: oldReports.map((r) => r.id) } } });

    const result = {
      sessions: sessions.count,
      tokens: verifications.count + resets.count,
      invitations: invitations.count,
      metricRows,
      reports: oldReports.length,
      auditLogs,
    };
    this.logger.info(result, 'Data cleanup completed');
    return result;
  }
}
