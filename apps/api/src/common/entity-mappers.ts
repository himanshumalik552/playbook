import { fromDbDate, type Prisma } from '@adpulse/database';
import type {
  ActionListItemDto,
  AlertDto,
  ChangeLogDto,
  RecommendationDto,
  RecommendationEvidenceItem,
  SyncJobDto,
} from '@adpulse/types';
import { iso, isoDate, num, userRef } from './mappers';

const USER = { select: { id: true, name: true } } as const;

export const ALERT_INCLUDE = {
  adAccount: { select: { name: true } },
  assignee: USER,
} satisfies Prisma.AlertInclude;
export type AlertWithRelations = Prisma.AlertGetPayload<{ include: typeof ALERT_INCLUDE }>;

export function toAlertDto(a: AlertWithRelations): AlertDto {
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    status: a.status,
    adAccountId: a.adAccountId,
    adAccountName: a.adAccount?.name ?? null,
    entityType: a.entityType,
    entityId: a.entityId,
    entityName: a.entityName,
    campaignId: a.campaignId,
    metric: a.metric,
    currentValue: num(a.currentValue),
    baselineValue: num(a.baselineValue),
    difference: num(a.difference),
    differencePercent: num(a.differencePercent),
    windowStart: fromDbDate(a.windowStart),
    windowEnd: fromDbDate(a.windowEnd),
    explanation: a.explanation,
    suggestedInvestigation: a.suggestedInvestigation,
    assignee: userRef(a.assignee),
    resolutionNote: a.resolutionNote,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export const RECOMMENDATION_INCLUDE = {
  campaign: { select: { name: true } },
  decidedBy: USER,
  actions: { select: { id: true }, where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.RecommendationInclude;
export type RecommendationWithRelations = Prisma.RecommendationGetPayload<{
  include: typeof RECOMMENDATION_INCLUDE;
}>;

export function toRecommendationDto(r: RecommendationWithRelations): RecommendationDto {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    rationale: r.rationale,
    evidence: Array.isArray(r.evidence) ? (r.evidence as unknown as RecommendationEvidenceItem[]) : [],
    affectedMetrics: r.affectedMetrics,
    confidence: r.confidence,
    status: r.status,
    adAccountId: r.adAccountId,
    campaignId: r.campaignId,
    campaignName: r.campaign?.name ?? null,
    entityType: r.entityType,
    entityId: r.entityId,
    entityName: r.entityName,
    dismissalReason: r.dismissalReason,
    decidedBy: userRef(r.decidedBy),
    decidedAt: iso(r.decidedAt),
    actionId: r.actions[0]?.id ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export const ACTION_LIST_INCLUDE = {
  owner: USER,
  campaign: { select: { name: true } },
} satisfies Prisma.OptimizationActionInclude;
export type ActionWithListRelations = Prisma.OptimizationActionGetPayload<{
  include: typeof ACTION_LIST_INCLUDE;
}>;

export function toActionListItem(a: ActionWithListRelations): ActionListItemDto {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    priority: a.priority,
    owner: userRef(a.owner),
    campaignId: a.campaignId,
    campaignName: a.campaign?.name ?? null,
    metricToMonitor: a.metricToMonitor,
    plannedDate: isoDate(a.plannedDate),
    completedAt: iso(a.completedAt),
    evaluationDate: isoDate(a.evaluationDate),
    resultClassification: a.resultClassification,
    updatedAt: a.updatedAt.toISOString(),
  };
}

export const SYNC_JOB_INCLUDE = {
  adAccount: { select: { name: true } },
  errors: {
    select: { code: true, message: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  },
} satisfies Prisma.SyncJobInclude;
export type SyncJobWithRelations = Prisma.SyncJobGetPayload<{ include: typeof SYNC_JOB_INCLUDE }>;

export function toSyncJobDto(j: SyncJobWithRelations): SyncJobDto {
  return {
    id: j.id,
    provider: j.provider,
    type: j.type,
    status: j.status,
    adAccountId: j.adAccountId,
    adAccountName: j.adAccount?.name ?? null,
    rangeStart: fromDbDate(j.rangeStart),
    rangeEnd: fromDbDate(j.rangeEnd),
    rowsProcessed: j.rowsProcessed,
    progress: j.progress,
    startedAt: iso(j.startedAt),
    finishedAt: iso(j.finishedAt),
    createdAt: j.createdAt.toISOString(),
    errors: j.errors.map((e) => ({ code: e.code, message: e.message, createdAt: e.createdAt.toISOString() })),
  };
}

export const CHANGE_LOG_INCLUDE = { changedBy: { select: { name: true } } } satisfies Prisma.ChangeLogInclude;
export type ChangeLogWithRelations = Prisma.ChangeLogGetPayload<{ include: typeof CHANGE_LOG_INCLUDE }>;

export function toChangeLogDto(c: ChangeLogWithRelations): ChangeLogDto {
  return {
    id: c.id,
    entityType: c.entityType,
    entityId: c.entityId,
    field: c.field,
    oldValue: c.oldValue,
    newValue: c.newValue,
    source: c.source,
    changedBy: c.changedBy?.name ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}
