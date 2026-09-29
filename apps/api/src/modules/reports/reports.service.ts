import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuditContext,
  type JobQueues,
  recordAudit,
  REPORT_CONTENT_TYPES,
  REPORT_EXTENSIONS,
  type ReportData,
  ReportDataService,
  type StorageProvider,
} from '@adpulse/core';
import { dbDate, fromDbDate, isUniqueViolation, type Prisma } from '@adpulse/database';
import {
  DEFAULT_REPORTING_PREFERENCES,
  type GeneratedReportDto,
  hasPermission,
  type Paginated,
  REPORT_SECTIONS,
  type ReportingPreferences,
  type ReportTemplateDto,
} from '@adpulse/types';
import { pageMeta } from '../../common/dto';
import { iso, userRef } from '../../common/mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import { JOB_QUEUES, STORAGE } from '../../infra/tokens';
import { resolveReportPeriod } from './report-period';
import type {
  GenerateReportDto,
  ReportListQueryDto,
  ReportScopeDto,
  TemplateDto,
  UpdateTemplateDto,
} from './reports.dto';

const REPORT_INCLUDE = {
  requestedBy: { select: { id: true, name: true } },
} satisfies Prisma.GeneratedReportInclude;
type ReportWithRelations = Prisma.GeneratedReportGetPayload<{ include: typeof REPORT_INCLUDE }>;

const FREQUENCY_TITLES = {
  DAILY: 'Daily performance report',
  WEEKLY: 'Weekly performance report',
  MONTHLY: 'Monthly performance report',
  CUSTOM: 'Performance report',
} as const;

function toReportDto(r: ReportWithRelations): GeneratedReportDto {
  return {
    id: r.id,
    title: r.title,
    format: r.format,
    status: r.status,
    frequency: r.frequency,
    periodStart: fromDbDate(r.periodStart),
    periodEnd: fromDbDate(r.periodEnd),
    fileSize: r.fileSize,
    error:
      r.status === 'FAILED'
        ? 'Report generation failed. Retry, or contact support if it keeps failing.'
        : null,
    requestedBy: userRef(r.requestedBy),
    createdAt: r.createdAt.toISOString(),
    completedAt: iso(r.completedAt),
  };
}

function toTemplateDto(t: Prisma.ReportTemplateGetPayload<object>): ReportTemplateDto {
  return {
    id: t.id,
    name: t.name,
    frequency: t.frequency,
    description: t.description,
    isDefault: t.isDefault,
    scheduleEnabled: t.scheduleEnabled,
    sections:
      Array.isArray(t.sections) && t.sections.length > 0
        ? (t.sections as string[])
        : REPORT_SECTIONS.map((s) => s.key),
    recipients: t.recipients,
  };
}

@Injectable()
export class ReportsService {
  private readonly data: ReportDataService;

  constructor(
    private readonly db: PrismaService,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {
    this.data = new ReportDataService(db);
  }

  private async preferences(organizationId: string): Promise<ReportingPreferences> {
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { reportingPreferences: true },
    });
    return {
      ...DEFAULT_REPORTING_PREFERENCES,
      ...(org.reportingPreferences as Partial<ReportingPreferences>),
    };
  }

  /** Validates scope ids against the organization so reports never reference another tenant's entities. */
  private async resolveScope(org: OrgContext, dto: ReportScopeDto) {
    const prefs = await this.preferences(org.organizationId);
    const period = resolveReportPeriod(dto.frequency, org.timezone, dto, new Date(), prefs.weekStartsOn);
    if (
      dto.adAccountId &&
      !(await this.db.adAccount.findFirst({
        where: { id: dto.adAccountId, organizationId: org.organizationId },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException('Ad account not found in this organization');
    }
    const campaignIds = dto.campaignIds?.length
      ? (
          await this.db.campaign.findMany({
            where: { id: { in: dto.campaignIds }, organizationId: org.organizationId },
            select: { id: true },
          })
        ).map((c) => c.id)
      : [];
    if (dto.campaignIds?.length && campaignIds.length !== new Set(dto.campaignIds).size) {
      throw new BadRequestException('One or more campaigns were not found in this organization');
    }
    return { period, adAccountId: dto.adAccountId ?? null, campaignIds };
  }

  sections() {
    return REPORT_SECTIONS;
  }

  async preview(org: OrgContext, dto: ReportScopeDto): Promise<ReportData> {
    const scope = await this.resolveScope(org, dto);
    return this.data.build({
      organizationId: org.organizationId,
      title: FREQUENCY_TITLES[dto.frequency],
      frequency: dto.frequency,
      period: scope.period,
      adAccountId: scope.adAccountId,
      campaignIds: scope.campaignIds,
    });
  }

  async list(org: OrgContext, query: ReportListQueryDto): Promise<Paginated<GeneratedReportDto>> {
    const where: Prisma.GeneratedReportWhereInput = {
      organizationId: org.organizationId,
      ...(query.format ? { format: query.format } : {}),
      ...(query.frequency ? { frequency: query.frequency } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.db.generatedReport.count({ where }),
      this.db.generatedReport.findMany({
        where,
        include: REPORT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toReportDto), meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(org: OrgContext, id: string): Promise<GeneratedReportDto> {
    const report = await this.db.generatedReport.findFirst({
      where: { id, organizationId: org.organizationId },
      include: REPORT_INCLUDE,
    });
    if (!report) throw new NotFoundException('Report not found');
    return toReportDto(report);
  }

  /** Idempotent when an Idempotency-Key is supplied: the same key returns the original report. */
  async generate(
    org: OrgContext,
    userId: string,
    dto: GenerateReportDto,
    idempotencyKey: string | null,
    ctx: AuditContext,
  ): Promise<{ report: GeneratedReportDto; created: boolean }> {
    if (dto.commentary && !hasPermission(org.role, 'reports:commentary')) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Your role cannot add report commentary',
      });
    }
    if (idempotencyKey) {
      const existing = await this.db.generatedReport.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: org.organizationId, idempotencyKey } },
        include: REPORT_INCLUDE,
      });
      if (existing) return { report: toReportDto(existing), created: false };
    }
    if (
      dto.templateId &&
      !(await this.db.reportTemplate.findFirst({
        where: { id: dto.templateId, organizationId: org.organizationId },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException('Template not found in this organization');
    }
    const scope = await this.resolveScope(org, dto);
    let report: ReportWithRelations;
    try {
      report = await this.db.generatedReport.create({
        data: {
          organizationId: org.organizationId,
          templateId: dto.templateId ?? null,
          title:
            dto.title?.trim() ||
            `${FREQUENCY_TITLES[dto.frequency]} · ${scope.period.from} – ${scope.period.to}`,
          frequency: dto.frequency,
          format: dto.format,
          periodStart: dbDate(scope.period.from),
          periodEnd: dbDate(scope.period.to),
          filters: { adAccountId: scope.adAccountId, campaignIds: scope.campaignIds },
          commentary: dto.commentary?.trim() || null,
          idempotencyKey,
          requestedById: userId,
        },
        include: REPORT_INCLUDE,
      });
    } catch (error) {
      if (!idempotencyKey || !isUniqueViolation(error)) throw error;
      const existing = await this.db.generatedReport.findUniqueOrThrow({
        where: { organizationId_idempotencyKey: { organizationId: org.organizationId, idempotencyKey } },
        include: REPORT_INCLUDE,
      });
      return { report: toReportDto(existing), created: false };
    }
    await this.queues.enqueueReport(
      { reportId: report.id, organizationId: org.organizationId },
      report.format,
    );
    await recordAudit(this.db, ctx, {
      action: 'report.requested',
      entityType: 'GeneratedReport',
      entityId: report.id,
      metadata: { format: report.format, frequency: report.frequency, period: scope.period },
    });
    return { report: toReportDto(report), created: true };
  }

  async retry(org: OrgContext, id: string, ctx: AuditContext): Promise<GeneratedReportDto> {
    const { count } = await this.db.generatedReport.updateMany({
      where: { id, organizationId: org.organizationId, status: 'FAILED' },
      data: { status: 'QUEUED', error: null },
    });
    if (count === 0) {
      const exists = await this.db.generatedReport.findFirst({
        where: { id, organizationId: org.organizationId },
        select: { status: true },
      });
      if (!exists) throw new NotFoundException('Report not found');
      throw new HttpException(
        { code: 'INVALID_STATE', message: 'Only failed reports can be retried' },
        HttpStatus.CONFLICT,
      );
    }
    const report = await this.db.generatedReport.findUniqueOrThrow({
      where: { id },
      select: { format: true },
    });
    await this.queues.enqueueReport(
      { reportId: id, organizationId: org.organizationId },
      report.format,
      `retry-${Date.now()}`,
    );
    await recordAudit(this.db, ctx, {
      action: 'report.retried',
      entityType: 'GeneratedReport',
      entityId: id,
    });
    return this.get(org, id);
  }

  async download(
    org: OrgContext,
    id: string,
    ctx: AuditContext,
  ): Promise<{ body: Buffer; filename: string; contentType: string }> {
    const report = await this.db.generatedReport.findFirst({
      where: { id, organizationId: org.organizationId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== 'COMPLETED' || !report.storageKey) {
      throw new HttpException(
        { code: 'INVALID_STATE', message: 'The report is not ready yet' },
        HttpStatus.CONFLICT,
      );
    }
    const body = await this.storage.get(report.storageKey);
    await recordAudit(this.db, ctx, {
      action: 'report.downloaded',
      entityType: 'GeneratedReport',
      entityId: report.id,
    });
    const safeTitle =
      report.title
        .replace(/[^A-Za-z0-9 _-]+/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 80) || 'report';
    return {
      body,
      filename: `${safeTitle}.${REPORT_EXTENSIONS[report.format]}`,
      contentType: REPORT_CONTENT_TYPES[report.format],
    };
  }

  /* ----------------------------- Templates ----------------------------- */

  async templates(org: OrgContext) {
    const rows = await this.db.reportTemplate.findMany({
      where: { organizationId: org.organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toTemplateDto);
  }

  /** Scheduled reports may only be emailed to members of the organization. */
  private async assertRecipients(
    organizationId: string,
    recipients: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (!recipients) return undefined;
    const normalized = [...new Set(recipients.map((r) => r.trim().toLowerCase()))];
    const members = await this.db.organizationMembership.findMany({
      where: { organizationId, user: { email: { in: normalized } } },
      select: { user: { select: { email: true } } },
    });
    const allowed = new Set(members.map((m) => m.user.email));
    const invalid = normalized.filter((r) => !allowed.has(r));
    if (invalid.length > 0) {
      throw new HttpException(
        {
          code: 'VALIDATION_FAILED',
          message: 'Recipients must be members of this organization',
          details: { invalid },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return normalized;
  }

  async createTemplate(org: OrgContext, dto: TemplateDto, ctx: AuditContext) {
    const recipients = (await this.assertRecipients(org.organizationId, dto.recipients)) ?? [];
    const template = await this.db.reportTemplate.create({
      data: {
        organizationId: org.organizationId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        frequency: dto.frequency,
        sections: dto.sections ?? REPORT_SECTIONS.map((s) => s.key),
        scheduleEnabled: dto.frequency !== 'CUSTOM' && (dto.scheduleEnabled ?? false),
        recipients,
      },
    });
    await recordAudit(this.db, ctx, {
      action: 'report_template.created',
      entityType: 'ReportTemplate',
      entityId: template.id,
    });
    return toTemplateDto(template);
  }

  async updateTemplate(org: OrgContext, id: string, dto: UpdateTemplateDto, ctx: AuditContext) {
    const template = await this.db.reportTemplate.findFirst({
      where: { id, organizationId: org.organizationId },
    });
    if (!template) throw new NotFoundException('Template not found');
    const recipients = await this.assertRecipients(org.organizationId, dto.recipients);
    if (dto.scheduleEnabled && template.frequency === 'CUSTOM')
      throw new BadRequestException('Custom-period templates cannot be scheduled');
    const updated = await this.db.reportTemplate.update({
      where: { id: template.id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.sections ? { sections: dto.sections } : {}),
        ...(dto.scheduleEnabled !== undefined ? { scheduleEnabled: dto.scheduleEnabled } : {}),
        ...(recipients ? { recipients } : {}),
      },
    });
    await recordAudit(this.db, ctx, {
      action: 'report_template.updated',
      entityType: 'ReportTemplate',
      entityId: template.id,
      metadata: { fields: Object.keys(dto) },
    });
    return toTemplateDto(updated);
  }

  async deleteTemplate(org: OrgContext, id: string, ctx: AuditContext): Promise<void> {
    const template = await this.db.reportTemplate.findFirst({
      where: { id, organizationId: org.organizationId },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (template.isDefault)
      throw new BadRequestException('Default templates cannot be deleted; disable the schedule instead');
    await this.db.reportTemplate.delete({ where: { id: template.id } });
    await recordAudit(this.db, ctx, {
      action: 'report_template.deleted',
      entityType: 'ReportTemplate',
      entityId: template.id,
    });
  }
}
