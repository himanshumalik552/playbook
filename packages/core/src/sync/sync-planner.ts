import { dbDate, isUniqueViolation, type PrismaClient, type SyncJob } from '@adpulse/database';
import { addDays, isoDateInTimezone } from '@adpulse/kpi';
import type { SyncType } from '@adpulse/types';

export interface PlanSyncOptions {
  organizationId: string;
  type: SyncType;
  adAccountIds?: string[];
  triggeredById?: string | null;
  idempotencyKey?: string | null;
  lookbackDays: number;
  initialDays: number;
  now?: Date;
}

/** Date window for a sync in the account's own timezone; Google Ads reports by account-local date. */
export function syncWindow(
  type: SyncType,
  timezone: string,
  lookbackDays: number,
  initialDays: number,
  now = new Date(),
) {
  const yesterday = addDays(isoDateInTimezone(now, timezone), -1);
  const days = type === 'INITIAL' ? initialDays : lookbackDays;
  return { from: addDays(yesterday, -(days - 1)), to: yesterday };
}

/**
 * Creates one SyncJob per active account. With an idempotency key, repeated requests return the
 * existing jobs instead of creating duplicates.
 */
export async function planSyncJobs(
  db: PrismaClient,
  options: PlanSyncOptions,
): Promise<{ jobs: SyncJob[]; created: boolean }> {
  if (options.idempotencyKey) {
    const existing = await db.syncJob.findMany({
      where: {
        organizationId: options.organizationId,
        idempotencyKey: { startsWith: `${options.idempotencyKey}:` },
      },
    });
    if (existing.length > 0) return { jobs: existing, created: false };
  }

  const accounts = await db.adAccount.findMany({
    where: {
      organizationId: options.organizationId,
      isActive: true,
      isManager: false,
      connectionId: { not: null },
      ...(options.adAccountIds?.length ? { id: { in: options.adAccountIds } } : {}),
    },
  });

  const active = await db.syncJob.findMany({
    where: {
      organizationId: options.organizationId,
      adAccountId: { in: accounts.map((a) => a.id) },
      status: { in: ['QUEUED', 'RUNNING'] },
    },
  });
  const busy = new Set(active.map((j) => j.adAccountId));

  const jobs: SyncJob[] = [...active];
  for (const account of accounts) {
    if (busy.has(account.id)) continue;
    const window = syncWindow(
      options.type,
      account.timezone,
      options.lookbackDays,
      options.initialDays,
      options.now,
    );
    try {
      jobs.push(
        await db.syncJob.create({
          data: {
            organizationId: options.organizationId,
            adAccountId: account.id,
            connectionId: account.connectionId,
            provider: 'GOOGLE_ADS',
            type: options.type,
            rangeStart: dbDate(window.from),
            rangeEnd: dbDate(window.to),
            triggeredById: options.triggeredById ?? null,
            idempotencyKey: options.idempotencyKey ? `${options.idempotencyKey}:${account.id}` : null,
          },
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return { jobs, created: jobs.length > active.length };
}
