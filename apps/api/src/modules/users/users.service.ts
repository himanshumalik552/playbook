import { Injectable, NotFoundException } from '@nestjs/common';
import { type AuditContext, recordAudit } from '@adpulse/core';
import type { CurrentUser, SessionInfo } from '@adpulse/types';
import { PrismaService } from '../../infra/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: PrismaService) {}

  async currentUser(userId: string): Promise<CurrentUser> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: { organization: true },
          where: { organization: { deletedAt: null } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const flags = await this.db.featureFlag.findMany();
    const orgIds = new Set(user.memberships.map((m) => m.organizationId));
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerifiedAt !== null,
      systemRole: user.systemRole,
      hasPassword: user.passwordHash !== null,
      memberships: user.memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role,
        onboardingCompleted: m.organization.onboardingCompletedAt !== null,
      })),
      featureFlags: Object.fromEntries(
        flags.map((f) => [f.key, f.enabled || f.organizationIds.some((id) => orgIds.has(id))]),
      ),
    };
  }

  async updateProfile(userId: string, name: string, ctx: AuditContext) {
    const updated = await this.db.user.update({ where: { id: userId }, data: { name: name.trim() } });
    await recordAudit(this.db, ctx, { action: 'user.profile_updated', entityType: 'User', entityId: userId });
    return { id: updated.id, name: updated.name };
  }

  async sessions(userId: string, currentSessionId: string): Promise<SessionInfo[]> {
    const sessions = await this.db.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, ctx: AuditContext): Promise<void> {
    const { count } = await this.db.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'revoked_by_user' },
    });
    if (count === 0) throw new NotFoundException('Session not found');
    await recordAudit(this.db, ctx, {
      action: 'auth.session_revoked',
      entityType: 'UserSession',
      entityId: sessionId,
    });
  }
}
