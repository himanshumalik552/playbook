import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JOBS } from '@adpulse/config';
import { type AuditContext, type JobQueues, recordAudit } from '@adpulse/core';
import type { Prisma } from '@adpulse/database';
import type { Paginated, RecommendationDto, RecommendationStatus } from '@adpulse/types';
import { pageMeta } from '../../common/dto';
import { RECOMMENDATION_INCLUDE, toRecommendationDto } from '../../common/entity-mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import { JOB_QUEUES } from '../../infra/tokens';
import { ActionsService } from '../actions/actions.service';
import type {
  ConvertRecommendationDto,
  CreateRecommendationDto,
  RecommendationListQueryDto,
} from './recommendations.dto';

const CONFIDENCE_ORDER = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
const DECIDABLE: RecommendationStatus[] = ['OPEN', 'APPROVED'];

type Actor = { userId: string; role: OrgContext['role'] };

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly actions: ActionsService,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
  ) {}

  async list(org: OrgContext, query: RecommendationListQueryDto): Promise<Paginated<RecommendationDto>> {
    const where: Prisma.RecommendationWhereInput = {
      organizationId: org.organizationId,
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.confidence ? { confidence: query.confidence } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { entityName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.db.recommendation.count({ where }),
      this.db.recommendation.findMany({
        where,
        include: RECOMMENDATION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ]);
    const sorted = rows.sort(
      (a, b) =>
        CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence] ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return {
      items: sorted
        .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
        .map(toRecommendationDto),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async get(org: OrgContext, id: string): Promise<RecommendationDto> {
    const rec = await this.db.recommendation.findFirst({
      where: { id, organizationId: org.organizationId },
      include: RECOMMENDATION_INCLUDE,
    });
    if (!rec) throw new NotFoundException('Recommendation not found');
    return toRecommendationDto(rec);
  }

  /** Manual recommendations must carry observed evidence, the same standard as generated ones. */
  async create(
    org: OrgContext,
    actor: Actor,
    dto: CreateRecommendationDto,
    ctx: AuditContext,
  ): Promise<RecommendationDto> {
    let campaign: { id: string; name: string; adAccountId: string } | null = null;
    if (dto.campaignId) {
      campaign = await this.db.campaign.findFirst({
        where: { id: dto.campaignId, organizationId: org.organizationId },
        select: { id: true, name: true, adAccountId: true },
      });
      if (!campaign) throw new BadRequestException('Campaign not found in this organization');
    }
    const rec = await this.db.recommendation.create({
      data: {
        organizationId: org.organizationId,
        type: dto.type,
        title: dto.title.trim(),
        rationale: dto.rationale.trim(),
        evidence: dto.evidence.map((e) => ({ label: e.label.trim(), value: e.value.trim() })),
        affectedMetrics: [],
        confidence: dto.confidence,
        entityType: campaign ? 'CAMPAIGN' : 'ORGANIZATION',
        entityId: campaign?.id ?? org.organizationId,
        entityName: campaign?.name ?? org.organizationName,
        campaignId: campaign?.id ?? null,
        adAccountId: campaign?.adAccountId ?? null,
        fingerprint: `manual:${randomUUID()}`,
      },
    });
    await recordAudit(this.db, ctx, {
      action: 'recommendation.created',
      entityType: 'Recommendation',
      entityId: rec.id,
      metadata: { type: dto.type, by: actor.userId },
    });
    return this.get(org, rec.id);
  }

  private async decide(
    org: OrgContext,
    actor: Actor,
    id: string,
    status: RecommendationStatus,
    extra: Prisma.RecommendationUncheckedUpdateManyInput,
    ctx: AuditContext,
  ) {
    const { count } = await this.db.recommendation.updateMany({
      where: { id, organizationId: org.organizationId, status: { in: DECIDABLE } },
      data: { status, decidedById: actor.userId, decidedAt: new Date(), ...extra },
    });
    if (count === 0) await this.throwNotDecidable(org, id);
    await recordAudit(this.db, ctx, {
      action: `recommendation.${status.toLowerCase()}`,
      entityType: 'Recommendation',
      entityId: id,
      metadata: { ...extra },
    });
    return this.get(org, id);
  }

  private async throwNotDecidable(org: OrgContext, id: string): Promise<never> {
    const rec = await this.db.recommendation.findFirst({
      where: { id, organizationId: org.organizationId },
      select: { status: true },
    });
    if (!rec) throw new NotFoundException('Recommendation not found');
    throw new HttpException(
      { code: 'INVALID_STATE', message: `Recommendation is already ${rec.status.toLowerCase()}` },
      HttpStatus.CONFLICT,
    );
  }

  approve(org: OrgContext, actor: Actor, id: string, ctx: AuditContext) {
    return this.decide(org, actor, id, 'APPROVED', {}, ctx);
  }

  dismiss(org: OrgContext, actor: Actor, id: string, reason: string, ctx: AuditContext) {
    return this.decide(org, actor, id, 'DISMISSED', { dismissalReason: reason.trim() }, ctx);
  }

  /** Creates a planned optimization action from the recommendation. Nothing is applied to Google Ads. */
  async convert(org: OrgContext, actor: Actor, id: string, dto: ConvertRecommendationDto, ctx: AuditContext) {
    const actionId = await this.db.$transaction(async (tx) => {
      const rec = await tx.recommendation.findFirst({ where: { id, organizationId: org.organizationId } });
      if (!rec) throw new NotFoundException('Recommendation not found');
      const { count } = await tx.recommendation.updateMany({
        where: { id: rec.id, status: { in: DECIDABLE } },
        data: { status: 'CONVERTED', decidedById: actor.userId, decidedAt: new Date() },
      });
      if (count === 0)
        throw new HttpException(
          { code: 'INVALID_STATE', message: `Recommendation is already ${rec.status.toLowerCase()}` },
          HttpStatus.CONFLICT,
        );
      const evidence = Array.isArray(rec.evidence)
        ? (rec.evidence as { label: string; value: string }[])
        : [];
      const action = await this.actions.createInTx(
        tx,
        org,
        actor,
        {
          title: dto.title ?? rec.title,
          description: [
            rec.rationale,
            '',
            'Evidence:',
            ...evidence.map((e) => `• ${e.label}: ${e.value}`),
          ].join('\n'),
          hypothesis: rec.rationale,
          campaignId: rec.campaignId,
          metricToMonitor: rec.affectedMetrics[0] ?? null,
          ownerId: dto.ownerId ?? actor.userId,
          priority: dto.priority ?? (rec.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM'),
          plannedDate: dto.plannedDate ?? null,
          recommendationId: rec.id,
          ...(rec.alertId ? { alertId: rec.alertId } : {}),
        },
        ctx,
      );
      await recordAudit(tx, ctx, {
        action: 'recommendation.converted',
        entityType: 'Recommendation',
        entityId: rec.id,
        metadata: { actionId: action.id },
      });
      return action.id;
    });
    return { recommendation: await this.get(org, id), actionId };
  }

  async requestGeneration(org: OrgContext, ctx: AuditContext) {
    await this.queues.enqueueAnalytics(JOBS.GENERATE_RECOMMENDATIONS, {
      organizationId: org.organizationId,
      trigger: 'manual',
    });
    await recordAudit(this.db, ctx, {
      action: 'recommendation.generation_requested',
      entityType: 'Organization',
      entityId: org.organizationId,
    });
    return { queued: true };
  }
}
