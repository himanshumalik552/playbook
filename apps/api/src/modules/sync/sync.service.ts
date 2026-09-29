import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AppEnv } from '@adpulse/config';
import { type AuditContext, type JobQueues, planSyncJobs, recordAudit } from '@adpulse/core';
import type { Prisma } from '@adpulse/database';
import type { Paginated, SyncJobDto, SyncStatus } from '@adpulse/types';
import { pageMeta } from '../../common/dto';
import { SYNC_JOB_INCLUDE, toSyncJobDto } from '../../common/entity-mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import { APP_ENV, JOB_QUEUES } from '../../infra/tokens';

@Injectable()
export class SyncService {
  constructor(
    private readonly db: PrismaService,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async list(
    org: OrgContext,
    query: { page: number; pageSize: number; status?: SyncStatus; adAccountId?: string },
  ): Promise<Paginated<SyncJobDto>> {
    const where: Prisma.SyncJobWhereInput = {
      organizationId: org.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.adAccountId ? { adAccountId: query.adAccountId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.db.syncJob.count({ where }),
      this.db.syncJob.findMany({
        where,
        include: SYNC_JOB_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toSyncJobDto), meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(org: OrgContext, id: string): Promise<SyncJobDto> {
    const job = await this.db.syncJob.findFirst({
      where: { id, organizationId: org.organizationId },
      include: SYNC_JOB_INCLUDE,
    });
    if (!job) throw new NotFoundException('Sync job not found');
    return toSyncJobDto(job);
  }

  /** Accounts that already have a queued or running job are not synced twice. */
  async trigger(
    org: OrgContext,
    userId: string,
    adAccountIds: string[] | undefined,
    key: string | null,
    ctx: AuditContext,
  ) {
    const { jobs, created } = await planSyncJobs(this.db, {
      organizationId: org.organizationId,
      type: 'MANUAL',
      adAccountIds,
      triggeredById: userId,
      idempotencyKey: key,
      lookbackDays: this.env.SYNC_LOOKBACK_DAYS,
      initialDays: this.env.INITIAL_SYNC_DAYS,
    });
    if (created) {
      for (const job of jobs.filter((j) => j.status === 'QUEUED')) {
        await this.queues.enqueueAdsSync({ syncJobId: job.id, organizationId: org.organizationId });
      }
      await recordAudit(this.db, ctx, {
        action: 'sync.triggered',
        entityType: 'Organization',
        entityId: org.organizationId,
        metadata: { jobs: jobs.map((j) => j.id) },
      });
    }
    const rows = await this.db.syncJob.findMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      include: SYNC_JOB_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { created, jobs: rows.map(toSyncJobDto) };
  }
}
