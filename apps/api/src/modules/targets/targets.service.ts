import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type AuditContext, DEFAULT_TARGETS, recordAudit, targetScopeKey } from '@adpulse/core';
import type { EntityType, Prisma } from '@adpulse/database';
import type { ChangeLogDto, Paginated, TargetDto, TargetMetric } from '@adpulse/types';
import { pageMeta } from '../../common/dto';
import { CHANGE_LOG_INCLUDE, toChangeLogDto } from '../../common/entity-mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import type { UpsertTargetDto } from './targets.dto';

const TARGET_INCLUDE = {
  adAccount: { select: { name: true } },
  campaign: { select: { name: true } },
  updatedBy: { select: { name: true } },
} satisfies Prisma.PerformanceTargetInclude;

type TargetWithRelations = Prisma.PerformanceTargetGetPayload<{ include: typeof TARGET_INCLUDE }>;

function toTargetDto(t: TargetWithRelations): TargetDto {
  return {
    id: t.id,
    scope: t.scope,
    metric: t.metric,
    value: Number(t.value),
    adAccountId: t.adAccountId,
    adAccountName: t.adAccount?.name ?? null,
    campaignId: t.campaignId,
    campaignName: t.campaign?.name ?? null,
    updatedAt: t.updatedAt.toISOString(),
    updatedBy: t.updatedBy?.name ?? null,
  };
}

const ENTITY_TYPE: Record<TargetDto['scope'], EntityType> = {
  ORGANIZATION: 'ORGANIZATION',
  AD_ACCOUNT: 'AD_ACCOUNT',
  CAMPAIGN: 'CAMPAIGN',
};

@Injectable()
export class TargetsService {
  constructor(private readonly db: PrismaService) {}

  async list(org: OrgContext): Promise<{ targets: TargetDto[]; defaults: Record<TargetMetric, number> }> {
    const targets = await this.db.performanceTarget.findMany({
      where: { organizationId: org.organizationId },
      include: TARGET_INCLUDE,
      orderBy: [{ scope: 'asc' }, { metric: 'asc' }],
    });
    return { targets: targets.map(toTargetDto), defaults: DEFAULT_TARGETS };
  }

  /** Validates that account/campaign scopes reference entities owned by the active organization. */
  private async resolveScope(organizationId: string, dto: UpsertTargetDto) {
    if (dto.scope === 'ORGANIZATION')
      return { adAccountId: null, campaignId: null, entityId: organizationId };
    if (dto.scope === 'AD_ACCOUNT') {
      const account = await this.db.adAccount.findFirst({ where: { id: dto.adAccountId, organizationId } });
      if (!account) throw new BadRequestException('Ad account not found in this organization');
      return { adAccountId: account.id, campaignId: null, entityId: account.id };
    }
    const campaign = await this.db.campaign.findFirst({ where: { id: dto.campaignId, organizationId } });
    if (!campaign) throw new BadRequestException('Campaign not found in this organization');
    return { adAccountId: campaign.adAccountId, campaignId: campaign.id, entityId: campaign.id };
  }

  async upsert(org: OrgContext, userId: string, dto: UpsertTargetDto, ctx: AuditContext): Promise<TargetDto> {
    const scope = await this.resolveScope(org.organizationId, dto);
    const scopeKey = targetScopeKey(dto.scope, scope.adAccountId, scope.campaignId);
    const target = await this.db.$transaction(async (tx) => {
      const existing = await tx.performanceTarget.findUnique({
        where: {
          organizationId_scopeKey_metric: {
            organizationId: org.organizationId,
            scopeKey,
            metric: dto.metric,
          },
        },
      });
      const saved = await tx.performanceTarget.upsert({
        where: {
          organizationId_scopeKey_metric: {
            organizationId: org.organizationId,
            scopeKey,
            metric: dto.metric,
          },
        },
        update: { value: dto.value, updatedById: userId },
        create: {
          organizationId: org.organizationId,
          scope: dto.scope,
          scopeKey,
          metric: dto.metric,
          value: dto.value,
          adAccountId: scope.adAccountId,
          campaignId: scope.campaignId,
          updatedById: userId,
        },
        include: TARGET_INCLUDE,
      });
      const oldValue = existing ? Number(existing.value).toString() : null;
      if (oldValue !== String(dto.value)) {
        await tx.changeLog.create({
          data: {
            organizationId: org.organizationId,
            entityType: ENTITY_TYPE[dto.scope],
            entityId: scope.entityId,
            campaignId: scope.campaignId,
            field: `target.${dto.metric}`,
            oldValue,
            newValue: String(dto.value),
            source: 'USER',
            changedById: userId,
          },
        });
      }
      await recordAudit(tx, ctx, {
        action: 'target.upserted',
        entityType: 'PerformanceTarget',
        entityId: saved.id,
        metadata: { scope: dto.scope, metric: dto.metric, from: oldValue, to: dto.value },
      });
      return saved;
    });
    return toTargetDto(target);
  }

  async remove(org: OrgContext, userId: string, id: string, ctx: AuditContext): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const target = await tx.performanceTarget.findFirst({
        where: { id, organizationId: org.organizationId },
      });
      if (!target) throw new NotFoundException('Target not found');
      await tx.performanceTarget.delete({ where: { id: target.id } });
      await tx.changeLog.create({
        data: {
          organizationId: org.organizationId,
          entityType: ENTITY_TYPE[target.scope],
          entityId: target.campaignId ?? target.adAccountId ?? org.organizationId,
          campaignId: target.campaignId,
          field: `target.${target.metric}`,
          oldValue: Number(target.value).toString(),
          newValue: null,
          source: 'USER',
          changedById: userId,
        },
      });
      await recordAudit(tx, ctx, {
        action: 'target.removed',
        entityType: 'PerformanceTarget',
        entityId: target.id,
        metadata: { metric: target.metric },
      });
    });
  }

  async history(
    org: OrgContext,
    page: number,
    pageSize: number,
    campaignId?: string,
  ): Promise<Paginated<ChangeLogDto>> {
    const where: Prisma.ChangeLogWhereInput = {
      organizationId: org.organizationId,
      field: { startsWith: 'target.' },
      ...(campaignId ? { campaignId } : {}),
    };
    const [total, items] = await Promise.all([
      this.db.changeLog.count({ where }),
      this.db.changeLog.findMany({
        where,
        include: CHANGE_LOG_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: items.map(toChangeLogDto), meta: pageMeta(page, pageSize, total) };
  }
}
