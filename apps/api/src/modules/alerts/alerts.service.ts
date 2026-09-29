import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JOBS } from '@adpulse/config';
import { type AuditContext, DEFAULT_RULES, type JobQueues, recordAudit } from '@adpulse/core';
import type { Prisma } from '@adpulse/database';
import type { AlertDto, AlertRuleDto, AlertStatus, Paginated } from '@adpulse/types';
import { pageMeta } from '../../common/dto';
import { ALERT_INCLUDE, toAlertDto } from '../../common/entity-mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import { JOB_QUEUES } from '../../infra/tokens';
import type { AlertListQueryDto, UpdateAlertDto, UpdateAlertRuleDto } from './alerts.dto';

const SEVERITY_ORDER = { CRITICAL: 3, WARNING: 2, INFO: 1 } as const;

interface AlertChanges {
  status?: AlertStatus;
  assigneeId?: string | null;
  resolutionNote?: string;
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly db: PrismaService,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
  ) {}

  async list(org: OrgContext, userId: string, query: AlertListQueryDto): Promise<Paginated<AlertDto>> {
    const where: Prisma.AlertWhereInput = {
      organizationId: org.organizationId,
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.severity?.length ? { severity: { in: query.severity } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.adAccountId ? { adAccountId: query.adAccountId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId === 'me' ? userId : query.assigneeId } : {}),
      ...(query.search
        ? {
            OR: [
              { entityName: { contains: query.search, mode: 'insensitive' } },
              { explanation: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const sortBy = query.sortBy ?? 'createdAt';
    const [total, rows] = await Promise.all([
      this.db.alert.count({ where }),
      sortBy === 'severity'
        ? this.db.alert.findMany({
            where,
            include: ALERT_INCLUDE,
            orderBy: { lastDetectedAt: 'desc' },
            take: 5000,
          })
        : this.db.alert.findMany({
            where,
            include: ALERT_INCLUDE,
            orderBy: { [sortBy]: query.sortDir },
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
    ]);
    // Severity is an enum whose storage order is not its business order, so it is sorted in memory.
    const items =
      sortBy === 'severity'
        ? rows
            .sort(
              (a, b) =>
                (query.sortDir === 'asc' ? 1 : -1) *
                (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
            )
            .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
        : rows;
    return { items: items.map(toAlertDto), meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(org: OrgContext, id: string): Promise<AlertDto> {
    const alert = await this.db.alert.findFirst({
      where: { id, organizationId: org.organizationId },
      include: ALERT_INCLUDE,
    });
    if (!alert) throw new NotFoundException('Alert not found');
    return toAlertDto(alert);
  }

  /** Assignees must be members of the same organization. */
  private async assertAssignee(organizationId: string, assigneeId: string | null | undefined): Promise<void> {
    if (!assigneeId) return;
    const member = await this.db.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: assigneeId } },
    });
    if (!member) throw new BadRequestException('Assignee must be a member of this organization');
  }

  private changeData(changes: AlertChanges): Prisma.AlertUncheckedUpdateManyInput {
    const now = new Date();
    return {
      ...(changes.status ? { status: changes.status } : {}),
      ...(changes.status === 'ACKNOWLEDGED' ? { acknowledgedAt: now } : {}),
      ...(changes.status === 'RESOLVED' || changes.status === 'DISMISSED' ? { resolvedAt: now } : {}),
      ...(changes.status === 'OPEN' ? { resolvedAt: null, acknowledgedAt: null } : {}),
      ...(changes.assigneeId !== undefined ? { assigneeId: changes.assigneeId } : {}),
      ...(changes.resolutionNote !== undefined
        ? { resolutionNote: changes.resolutionNote.trim() || null }
        : {}),
    };
  }

  private assertHasChanges(changes: AlertChanges): void {
    if (
      changes.status === undefined &&
      changes.assigneeId === undefined &&
      changes.resolutionNote === undefined
    ) {
      throw new BadRequestException('No changes supplied');
    }
  }

  async update(org: OrgContext, id: string, dto: UpdateAlertDto, ctx: AuditContext): Promise<AlertDto> {
    this.assertHasChanges(dto);
    await this.assertAssignee(org.organizationId, dto.assigneeId);
    const { count } = await this.db.alert.updateMany({
      where: { id, organizationId: org.organizationId },
      data: this.changeData(dto),
    });
    if (count === 0) throw new NotFoundException('Alert not found');
    await recordAudit(this.db, ctx, {
      action: 'alert.updated',
      entityType: 'Alert',
      entityId: id,
      metadata: { ...dto },
    });
    return this.get(org, id);
  }

  async bulkUpdate(
    org: OrgContext,
    ids: string[],
    changes: AlertChanges,
    ctx: AuditContext,
  ): Promise<{ updated: number }> {
    this.assertHasChanges(changes);
    await this.assertAssignee(org.organizationId, changes.assigneeId);
    const unique = [...new Set(ids)];
    const { count } = await this.db.alert.updateMany({
      where: { id: { in: unique }, organizationId: org.organizationId },
      data: this.changeData(changes),
    });
    await recordAudit(this.db, ctx, {
      action: 'alert.bulk_updated',
      entityType: 'Alert',
      metadata: { ids: unique, updated: count, ...changes },
    });
    return { updated: count };
  }

  async requestEvaluation(org: OrgContext, ctx: AuditContext): Promise<{ queued: true }> {
    await this.queues.enqueueAnalytics(JOBS.EVALUATE_ALERTS, {
      organizationId: org.organizationId,
      trigger: 'manual',
    });
    await recordAudit(this.db, ctx, {
      action: 'alert.evaluation_requested',
      entityType: 'Organization',
      entityId: org.organizationId,
    });
    return { queued: true };
  }

  /* ----------------------------- Rules ----------------------------- */

  private toRuleDto(rule: Prisma.AlertRuleGetPayload<object>): AlertRuleDto {
    const defaults = DEFAULT_RULES[rule.type];
    return {
      id: rule.id,
      type: rule.type,
      name: rule.name,
      description: defaults.description,
      enabled: rule.enabled,
      severity: rule.severity,
      thresholds: { ...defaults.thresholds, ...(rule.thresholds as Record<string, number>) },
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  async rules(org: OrgContext): Promise<AlertRuleDto[]> {
    await this.db.alertRule.createMany({
      data: Object.entries(DEFAULT_RULES).map(([type, rule]) => ({
        organizationId: org.organizationId,
        type: type as keyof typeof DEFAULT_RULES,
        name: rule.name,
        enabled: rule.enabled,
        severity: rule.severity,
        thresholds: rule.thresholds,
      })),
      skipDuplicates: true,
    });
    const rows = await this.db.alertRule.findMany({
      where: { organizationId: org.organizationId },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toRuleDto(r));
  }

  async updateRule(
    org: OrgContext,
    id: string,
    dto: UpdateAlertRuleDto,
    ctx: AuditContext,
  ): Promise<AlertRuleDto> {
    const rule = await this.db.alertRule.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!rule) throw new NotFoundException('Alert rule not found');
    let thresholds: Record<string, number> | undefined;
    if (dto.thresholds) {
      const allowed = DEFAULT_RULES[rule.type].thresholds;
      const invalid = Object.entries(dto.thresholds).filter(
        ([key, value]) =>
          !(key in allowed) ||
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1_000_000,
      );
      if (invalid.length > 0) {
        throw new HttpException(
          {
            code: 'VALIDATION_FAILED',
            message: 'Invalid thresholds',
            details: { invalid: invalid.map(([k]) => k), allowed: Object.keys(allowed) },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      thresholds = { ...allowed, ...(rule.thresholds as Record<string, number>), ...dto.thresholds };
    }
    const updated = await this.db.alertRule.update({
      where: { id: rule.id },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.severity ? { severity: dto.severity } : {}),
        ...(thresholds ? { thresholds } : {}),
      },
    });
    await recordAudit(this.db, ctx, {
      action: 'alert_rule.updated',
      entityType: 'AlertRule',
      entityId: rule.id,
      metadata: { type: rule.type, ...dto },
    });
    return this.toRuleDto(updated);
  }

  async resetRule(org: OrgContext, id: string, ctx: AuditContext): Promise<AlertRuleDto> {
    const rule = await this.db.alertRule.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!rule) throw new NotFoundException('Alert rule not found');
    const defaults = DEFAULT_RULES[rule.type];
    const updated = await this.db.alertRule.update({
      where: { id: rule.id },
      data: { enabled: defaults.enabled, severity: defaults.severity, thresholds: defaults.thresholds },
    });
    await recordAudit(this.db, ctx, {
      action: 'alert_rule.reset',
      entityType: 'AlertRule',
      entityId: rule.id,
      metadata: { type: rule.type },
    });
    return this.toRuleDto(updated);
  }
}
