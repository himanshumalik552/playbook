import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type AppEnv, type DeadLetterPayload, QUEUES, type QueueName } from '@adpulse/config';
import { type AuditContext, type JobQueues, recordAudit } from '@adpulse/core';
import type { FeatureFlag, Prisma } from '@adpulse/database';
import type {
  AdminOrganizationDto,
  AdminUserDto,
  FailedJobDto,
  FeatureFlagDto,
  Paginated,
  QueueHealthDto,
  SyncJobDto,
  SystemHealthDto,
} from '@adpulse/types';
import type { Job } from 'bullmq';
import { pageMeta, paginateArray, type PaginationQueryDto } from '../../common/dto';
import { SYNC_JOB_INCLUDE, toSyncJobDto } from '../../common/entity-mappers';
import { iso } from '../../common/mappers';
import { PrismaService } from '../../infra/prisma.service';
import { APP_ENV, JOB_QUEUES } from '../../infra/tokens';
import { QUEUE_NAMES } from './admin.dto';

/** Email bodies can contain personal data and one-time links; the admin view only needs routing fields. */
const HIDDEN_JOB_FIELDS = new Set(['html', 'text']);
const MAX_DEAD_LETTERS = 1000;

function safeJobData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(([key]) => !HIDDEN_JOB_FIELDS.has(key)),
  );
}

function toFailedJob(job: Job<DeadLetterPayload>): FailedJobDto {
  return {
    id: job.id ?? '',
    queue: job.data.queue,
    name: job.data.jobName,
    failedReason: job.data.failedReason,
    attemptsMade: job.data.attemptsMade,
    timestamp: new Date(job.timestamp).toISOString(),
    data: safeJobData(job.data.data),
  };
}

function toFeatureFlag(f: FeatureFlag): FeatureFlagDto {
  return {
    id: f.id,
    key: f.key,
    description: f.description,
    enabled: f.enabled,
    organizationIds: f.organizationIds,
    updatedAt: f.updatedAt.toISOString(),
  };
}

const toMb = (bytes: number) => Math.round(bytes / 1024 / 1024);

@Injectable()
export class AdminService {
  constructor(
    private readonly db: PrismaService,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async health(): Promise<SystemHealthDto> {
    const [database, redis] = await Promise.all([this.db.isHealthy(), this.queues.ping()]);
    const counts: [number, number, number, number, number] = database
      ? await Promise.all([
          this.db.organization.count({ where: { deletedAt: null } }),
          this.db.user.count({ where: { deletedAt: null } }),
          this.db.campaign.count(),
          this.db.campaignDailyMetric.count(),
          this.db.alert.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
        ])
      : [0, 0, 0, 0, 0];
    const [organizations, users, campaigns, metricRows, openAlerts] = counts;
    const memory = process.memoryUsage();
    return {
      status: database && redis ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      database: database ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
      version: this.env.APP_VERSION,
      integrationMode: this.env.INTEGRATION_MODE,
      counts: { organizations, users, campaigns, metricRows, openAlerts },
      memory: { rssMb: toMb(memory.rss), heapUsedMb: toMb(memory.heapUsed) },
    };
  }

  async organizations(query: PaginationQueryDto): Promise<Paginated<AdminOrganizationDto>> {
    const where: Prisma.OrganizationWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { slug: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.db.organization.count({ where }),
      this.db.organization.findMany({
        where,
        include: { _count: { select: { memberships: true, adAccounts: true } } },
        orderBy: { createdAt: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        members: o._count.memberships,
        adAccounts: o._count.adAccounts,
        createdAt: o.createdAt.toISOString(),
        deletedAt: iso(o.deletedAt),
      })),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async users(query: PaginationQueryDto): Promise<Paginated<AdminUserDto>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.db.user.count({ where }),
      this.db.user.findMany({
        where,
        include: { _count: { select: { memberships: true } } },
        orderBy: { createdAt: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        systemRole: u.systemRole,
        organizations: u._count.memberships,
        lastLoginAt: iso(u.lastLoginAt),
        lockedUntil: iso(u.lockedUntil),
        createdAt: u.createdAt.toISOString(),
      })),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async unlockUser(id: string, ctx: AuditContext): Promise<void> {
    const user = await this.db.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    await this.db.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } });
    await recordAudit(this.db, ctx, { action: 'admin.user_unlocked', entityType: 'User', entityId: id });
  }

  async featureFlags(): Promise<FeatureFlagDto[]> {
    const flags = await this.db.featureFlag.findMany({ orderBy: { key: 'asc' } });
    return flags.map(toFeatureFlag);
  }

  async updateFeatureFlag(
    key: string,
    dto: { enabled?: boolean; organizationIds?: string[] },
    ctx: AuditContext,
  ): Promise<FeatureFlagDto> {
    const flag = await this.db.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundException('Feature flag not found');
    if (dto.organizationIds?.length) {
      const found = await this.db.organization.count({ where: { id: { in: dto.organizationIds } } });
      if (found !== new Set(dto.organizationIds).size)
        throw new BadRequestException('One or more organizations do not exist');
    }
    const updated = await this.db.featureFlag.update({
      where: { key },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.organizationIds ? { organizationIds: [...new Set(dto.organizationIds)] } : {}),
      },
    });
    await recordAudit(this.db, ctx, {
      action: 'admin.feature_flag_updated',
      entityType: 'FeatureFlag',
      entityId: updated.id,
      metadata: { key, ...dto },
    });
    return toFeatureFlag(updated);
  }

  async queueHealth(): Promise<QueueHealthDto[]> {
    return Promise.all(
      QUEUE_NAMES.map(async (name) => {
        const counts = await this.queues
          .get(name)
          .getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        return {
          name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      }),
    );
  }

  private deadLetters(): Promise<Job<DeadLetterPayload>[]> {
    return this.queues
      .get(QUEUES.DEAD_LETTER)
      .getJobs(['waiting', 'delayed', 'paused'], 0, MAX_DEAD_LETTERS - 1) as Promise<
      Job<DeadLetterPayload>[]
    >;
  }

  /** Jobs that exhausted their retries; they stay in the dead-letter queue until retried or discarded. */
  async failedJobs(query: {
    page: number;
    pageSize: number;
    queue?: QueueName;
  }): Promise<Paginated<FailedJobDto>> {
    const jobs = (await this.deadLetters())
      .filter((job) => !query.queue || job.data.queue === query.queue)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(toFailedJob);
    return paginateArray(jobs, query.page, query.pageSize);
  }

  private async deadLetter(id: string): Promise<Job<DeadLetterPayload>> {
    const job = (await this.queues.get(QUEUES.DEAD_LETTER).getJob(id)) as Job<DeadLetterPayload> | undefined;
    if (!job) throw new NotFoundException('Dead-lettered job not found');
    return job;
  }

  async retryFailedJob(id: string, ctx: AuditContext): Promise<void> {
    const job = await this.deadLetter(id);
    const queue = job.data.queue as QueueName;
    if (!QUEUE_NAMES.includes(queue) || queue === QUEUES.DEAD_LETTER)
      throw new BadRequestException('Unknown source queue');
    await this.queues.get(queue).add(job.data.jobName, job.data.data, { jobId: `dlq-retry_${id}` });
    await job.remove();
    await recordAudit(this.db, ctx, {
      action: 'admin.job_retried',
      entityType: 'Job',
      entityId: id,
      metadata: { queue, name: job.data.jobName },
    });
  }

  async discardFailedJob(id: string, ctx: AuditContext): Promise<void> {
    const job = await this.deadLetter(id);
    await job.remove();
    await recordAudit(this.db, ctx, {
      action: 'admin.job_discarded',
      entityType: 'Job',
      entityId: id,
      metadata: { queue: job.data.queue, name: job.data.jobName },
    });
  }

  /** Failed synchronizations across all organizations, newest first. */
  async syncFailures(query: {
    page: number;
    pageSize: number;
  }): Promise<Paginated<SyncJobDto & { organizationId: string; organizationName: string }>> {
    const where: Prisma.SyncJobWhereInput = { status: { in: ['FAILED', 'PARTIAL'] } };
    const [total, rows] = await Promise.all([
      this.db.syncJob.count({ where }),
      this.db.syncJob.findMany({
        where,
        include: { ...SYNC_JOB_INCLUDE, organization: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        ...toSyncJobDto(row),
        organizationId: row.organization.id,
        organizationName: row.organization.name,
      })),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }
}
