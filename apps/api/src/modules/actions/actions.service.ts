import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type AuditContext, recordAudit } from '@adpulse/core';
import { dbDate, Prisma, type TransactionClient } from '@adpulse/database';
import {
  type ActionAttachment,
  type ActionDetailDto,
  type ActionListItemDto,
  type ActionStatus,
  ACTION_STATUSES,
  hasPermission,
  type Paginated,
} from '@adpulse/types';
import { pageMeta } from '../../common/dto';
import {
  ACTION_LIST_INCLUDE,
  CHANGE_LOG_INCLUDE,
  toActionListItem,
  toChangeLogDto,
} from '../../common/entity-mappers';
import { num, userRef } from '../../common/mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import { planTransition } from './action-workflow';
import type {
  ActionFieldsDto,
  ActionListQueryDto,
  CreateActionDto,
  TransitionActionDto,
  UpdateActionDto,
} from './actions.dto';

const PRIORITY_ORDER = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

const DETAIL_INCLUDE = {
  ...ACTION_LIST_INCLUDE,
  adGroup: { select: { name: true } },
  createdBy: { select: { id: true, name: true } },
  comments: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OptimizationActionInclude;

/** Fields tracked in change history, with their string rendering. */
const TRACKED_FIELDS = [
  'title',
  'description',
  'hypothesis',
  'expectedImpact',
  'campaignId',
  'adGroupId',
  'metricToMonitor',
  'baselineValue',
  'targetValue',
  'ownerId',
  'priority',
  'plannedDate',
  'evaluationDate',
] as const;

type Actor = { userId: string; role: OrgContext['role'] };

function render(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value instanceof Prisma.Decimal) return value.toString();
  return String(value);
}

@Injectable()
export class ActionsService {
  constructor(private readonly db: PrismaService) {}

  async list(
    org: OrgContext,
    userId: string,
    query: ActionListQueryDto,
  ): Promise<Paginated<ActionListItemDto>> {
    const where: Prisma.OptimizationActionWhereInput = {
      organizationId: org.organizationId,
      deletedAt: null,
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId === 'me' ? userId : query.ownerId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const sortBy = query.sortBy ?? 'updatedAt';
    if (sortBy === 'priority') {
      const [total, rows] = await Promise.all([
        this.db.optimizationAction.count({ where }),
        this.db.optimizationAction.findMany({
          where,
          include: ACTION_LIST_INCLUDE,
          orderBy: { updatedAt: 'desc' },
          take: 5000,
        }),
      ]);
      const sorted = rows.sort(
        (a, b) =>
          (query.sortDir === 'asc' ? 1 : -1) * (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
      );
      return {
        items: sorted
          .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
          .map(toActionListItem),
        meta: pageMeta(query.page, query.pageSize, total),
      };
    }
    const [total, rows] = await Promise.all([
      this.db.optimizationAction.count({ where }),
      this.db.optimizationAction.findMany({
        where,
        include: ACTION_LIST_INCLUDE,
        orderBy:
          sortBy === 'plannedDate'
            ? { plannedDate: { sort: query.sortDir, nulls: 'last' } }
            : { [sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toActionListItem), meta: pageMeta(query.page, query.pageSize, total) };
  }

  /** Kanban columns: every status with its actions, most recently updated first. */
  async board(org: OrgContext): Promise<Record<ActionStatus, ActionListItemDto[]>> {
    const rows = await this.db.optimizationAction.findMany({
      where: { organizationId: org.organizationId, deletedAt: null },
      include: ACTION_LIST_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    const board = Object.fromEntries(ACTION_STATUSES.map((s) => [s, [] as ActionListItemDto[]])) as Record<
      ActionStatus,
      ActionListItemDto[]
    >;
    for (const row of rows) board[row.status].push(toActionListItem(row));
    return board;
  }

  async get(org: OrgContext, id: string): Promise<ActionDetailDto> {
    const action = await this.db.optimizationAction.findFirst({
      where: { id, organizationId: org.organizationId, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!action) throw new NotFoundException('Action not found');
    const history = await this.db.changeLog.findMany({
      where: { organizationId: org.organizationId, entityType: 'OPTIMIZATION_ACTION', entityId: action.id },
      include: CHANGE_LOG_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      ...toActionListItem(action),
      description: action.description,
      hypothesis: action.hypothesis,
      expectedImpact: action.expectedImpact,
      adAccountId: action.adAccountId,
      adGroupId: action.adGroupId,
      adGroupName: action.adGroup?.name ?? null,
      baselineValue: num(action.baselineValue),
      targetValue: num(action.targetValue),
      actualValue: num(action.actualValue),
      actualResult: action.actualResult,
      cancellationReason: action.cancellationReason,
      alertId: action.alertId,
      recommendationId: action.recommendationId,
      attachments: Array.isArray(action.attachments)
        ? (action.attachments as unknown as ActionAttachment[])
        : [],
      comments: action.comments.map((c) => ({
        id: c.id,
        body: c.body,
        author: { id: c.author.id, name: c.author.name },
        createdAt: c.createdAt.toISOString(),
      })),
      history: history.map(toChangeLogDto),
      createdBy: userRef(action.createdBy),
      createdAt: action.createdAt.toISOString(),
    };
  }

  /** Every referenced entity must belong to the active organization. */
  private async resolveReferences(
    tx: TransactionClient,
    org: OrgContext,
    actor: Actor,
    dto: ActionFieldsDto & { alertId?: string; recommendationId?: string },
  ) {
    const organizationId = org.organizationId;
    const resolved: { adAccountId?: string | null } = {};
    if (dto.campaignId) {
      const campaign = await tx.campaign.findFirst({
        where: { id: dto.campaignId, organizationId },
        select: { adAccountId: true },
      });
      if (!campaign) throw new BadRequestException('Campaign not found in this organization');
      resolved.adAccountId = campaign.adAccountId;
    } else if (dto.campaignId === null) {
      resolved.adAccountId = null;
    }
    if (dto.adGroupId) {
      const group = await tx.adGroup.findFirst({
        where: { id: dto.adGroupId, organizationId },
        select: { campaignId: true },
      });
      if (!group) throw new BadRequestException('Ad group not found in this organization');
      if (dto.campaignId && group.campaignId !== dto.campaignId)
        throw new BadRequestException('Ad group does not belong to the selected campaign');
    }
    if (dto.ownerId) {
      if (dto.ownerId !== actor.userId && !hasPermission(actor.role, 'actions:assign')) {
        throw new ForbiddenException({
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Your role cannot assign actions to other people',
        });
      }
      const member = await tx.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId: dto.ownerId } },
      });
      if (!member) throw new BadRequestException('Owner must be a member of this organization');
    }
    if (
      dto.alertId &&
      !(await tx.alert.findFirst({ where: { id: dto.alertId, organizationId }, select: { id: true } }))
    ) {
      throw new BadRequestException('Alert not found in this organization');
    }
    if (
      dto.recommendationId &&
      !(await tx.recommendation.findFirst({
        where: { id: dto.recommendationId, organizationId },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException('Recommendation not found in this organization');
    }
    return resolved;
  }

  private fieldData(dto: ActionFieldsDto) {
    const date = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null ? null : dbDate(v);
    const text = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
    return {
      description: text(dto.description),
      hypothesis: text(dto.hypothesis),
      expectedImpact: text(dto.expectedImpact),
      campaignId: dto.campaignId,
      adGroupId: dto.adGroupId,
      metricToMonitor: dto.metricToMonitor,
      baselineValue: dto.baselineValue,
      targetValue: dto.targetValue,
      ownerId: dto.ownerId,
      priority: dto.priority,
      plannedDate: date(dto.plannedDate),
      evaluationDate: date(dto.evaluationDate),
      ...(dto.attachments
        ? { attachments: dto.attachments.map((a) => ({ name: a.name.trim(), url: a.url })) }
        : {}),
    };
  }

  /** Creates an action inside an existing transaction (used by recommendation conversion). */
  async createInTx(
    tx: TransactionClient,
    org: OrgContext,
    actor: Actor,
    dto: CreateActionDto,
    ctx: AuditContext,
  ) {
    const refs = await this.resolveReferences(tx, org, actor, dto);
    const action = await tx.optimizationAction.create({
      data: {
        ...this.fieldData(dto),
        organizationId: org.organizationId,
        title: dto.title.trim(),
        adAccountId: refs.adAccountId ?? null,
        alertId: dto.alertId ?? null,
        recommendationId: dto.recommendationId ?? null,
        createdById: actor.userId,
        status: 'BACKLOG',
      },
    });
    await tx.changeLog.create({
      data: {
        organizationId: org.organizationId,
        entityType: 'OPTIMIZATION_ACTION',
        entityId: action.id,
        campaignId: action.campaignId,
        field: 'status',
        oldValue: null,
        newValue: 'BACKLOG',
        changedById: actor.userId,
      },
    });
    await recordAudit(tx, ctx, {
      action: 'action.created',
      entityType: 'OptimizationAction',
      entityId: action.id,
      metadata: { title: action.title },
    });
    return action;
  }

  async create(
    org: OrgContext,
    actor: Actor,
    dto: CreateActionDto,
    ctx: AuditContext,
  ): Promise<ActionDetailDto> {
    const action = await this.db.$transaction((tx) => this.createInTx(tx, org, actor, dto, ctx));
    return this.get(org, action.id);
  }

  async update(
    org: OrgContext,
    actor: Actor,
    id: string,
    dto: UpdateActionDto,
    ctx: AuditContext,
  ): Promise<ActionDetailDto> {
    await this.db.$transaction(async (tx) => {
      const before = await tx.optimizationAction.findFirst({
        where: { id, organizationId: org.organizationId, deletedAt: null },
      });
      if (!before) throw new NotFoundException('Action not found');
      if (before.status === 'EVALUATED' || before.status === 'CANCELLED') {
        throw new BadRequestException(`A ${before.status.toLowerCase()} action can no longer be edited`);
      }
      const refs = await this.resolveReferences(tx, org, actor, dto);
      const data = { ...this.fieldData(dto), ...(dto.title ? { title: dto.title.trim() } : {}), ...refs };
      const after = await tx.optimizationAction.update({ where: { id: before.id }, data });
      const changes = TRACKED_FIELDS.filter((f) => render(before[f]) !== render(after[f])).map((field) => ({
        organizationId: org.organizationId,
        entityType: 'OPTIMIZATION_ACTION' as const,
        entityId: before.id,
        campaignId: after.campaignId,
        field,
        oldValue: render(before[field]),
        newValue: render(after[field]),
        changedById: actor.userId,
      }));
      if (changes.length > 0) await tx.changeLog.createMany({ data: changes });
      await recordAudit(tx, ctx, {
        action: 'action.updated',
        entityType: 'OptimizationAction',
        entityId: before.id,
        metadata: { fields: changes.map((c) => c.field) },
      });
    });
    return this.get(org, id);
  }

  async transition(
    org: OrgContext,
    actor: Actor,
    id: string,
    dto: TransitionActionDto,
    ctx: AuditContext,
  ): Promise<ActionDetailDto> {
    await this.db.$transaction(async (tx) => {
      const action = await tx.optimizationAction.findFirst({
        where: { id, organizationId: org.organizationId, deletedAt: null },
      });
      if (!action) throw new NotFoundException('Action not found');
      const patch = planTransition(action.status, dto.status, dto);
      // Compare-and-set on status prevents two concurrent transitions from both succeeding.
      const { count } = await tx.optimizationAction.updateMany({
        where: { id: action.id, status: action.status },
        data: patch,
      });
      if (count === 0)
        throw new BadRequestException('The action was changed by someone else; reload and try again');
      await tx.changeLog.create({
        data: {
          organizationId: org.organizationId,
          entityType: 'OPTIMIZATION_ACTION',
          entityId: action.id,
          campaignId: action.campaignId,
          field: 'status',
          oldValue: action.status,
          newValue: dto.status,
          changedById: actor.userId,
        },
      });
      await recordAudit(tx, ctx, {
        action: 'action.status_changed',
        entityType: 'OptimizationAction',
        entityId: action.id,
        metadata: { from: action.status, to: dto.status, classification: patch.resultClassification ?? null },
      });
    });
    return this.get(org, id);
  }

  async comment(org: OrgContext, actor: Actor, id: string, body: string, ctx: AuditContext) {
    const action = await this.db.optimizationAction.findFirst({
      where: { id, organizationId: org.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!action) throw new NotFoundException('Action not found');
    const comment = await this.db.actionComment.create({
      data: {
        organizationId: org.organizationId,
        actionId: action.id,
        authorId: actor.userId,
        body: body.trim(),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    await recordAudit(this.db, ctx, {
      action: 'action.commented',
      entityType: 'OptimizationAction',
      entityId: action.id,
    });
    return {
      id: comment.id,
      body: comment.body,
      author: { id: comment.author.id, name: comment.author.name },
      createdAt: comment.createdAt.toISOString(),
    };
  }

  async remove(org: OrgContext, id: string, ctx: AuditContext): Promise<void> {
    const { count } = await this.db.optimizationAction.updateMany({
      where: { id, organizationId: org.organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Action not found');
    await recordAudit(this.db, ctx, {
      action: 'action.deleted',
      entityType: 'OptimizationAction',
      entityId: id,
    });
  }
}
