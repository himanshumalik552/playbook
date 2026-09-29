import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@adpulse/database';
import type { AuditLogDto, Paginated } from '@adpulse/types';
import { pageMeta } from '../../common/dto';
import { userRef } from '../../common/mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import type { AuditLogQueryDto } from './audit-logs.dto';

const DAY_MS = 86_400_000;

@Injectable()
export class AuditLogsService {
  constructor(private readonly db: PrismaService) {}

  async list(org: OrgContext, query: AuditLogQueryDto): Promise<Paginated<AuditLogDto>> {
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException('"from" must be on or before "to"');
    const createdAt: Prisma.DateTimeFilter = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + DAY_MS) } : {}),
    };
    const where: Prisma.AuditLogWhereInput = {
      organizationId: org.organizationId,
      ...(query.action
        ? { action: query.action.endsWith('.') ? { startsWith: query.action } : query.action }
        : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from || query.to ? { createdAt } : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' } },
              { actor: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.db.auditLog.count({ where }),
      this.db.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actor: userRef(row.actor),
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }
}
