import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppEnv } from '@adpulse/config';
import {
  type AuditContext,
  diffFields,
  generateToken,
  hashToken,
  invitationEmail,
  JobQueues,
  recordAudit,
} from '@adpulse/core';
import type { Organization, Prisma } from '@adpulse/database';
import {
  type BrandingSettings,
  DEFAULT_BRANDING,
  DEFAULT_REPORTING_PREFERENCES,
  type InvitationDto,
  type MemberDto,
  ORG_ROLE_RANK,
  type OrganizationSettings,
  type OrgRole,
  type ReportingPreferences,
  ROLE_LABELS,
  type Role,
} from '@adpulse/types';
import { PrismaService } from '../../infra/prisma.service';
import { APP_ENV, JOB_QUEUES } from '../../infra/tokens';
import type { CreateOrganizationDto, UpdateOrganizationDto } from './organizations.dto';

const INVITE_TTL_MS = 7 * 86_400_000;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  );
}

/** Admins may assign any role; managers may not grant roles above their own. */
function assertCanAssign(actorRole: Role, target: OrgRole): void {
  if (actorRole === 'SUPER_ADMIN' || actorRole === 'ORGANIZATION_ADMIN') return;
  if (ORG_ROLE_RANK[target] > ORG_ROLE_RANK[actorRole]) {
    throw new ForbiddenException({
      code: 'ROLE_ESCALATION',
      message: 'You cannot grant a role higher than your own',
    });
  }
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
  ) {}

  toSettings(org: Organization): OrganizationSettings {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      currencyCode: org.currencyCode,
      timezone: org.timezone,
      reportingPreferences: {
        ...DEFAULT_REPORTING_PREFERENCES,
        ...(org.reportingPreferences as Partial<ReportingPreferences>),
      },
      branding: { ...DEFAULT_BRANDING, ...(org.branding as Partial<BrandingSettings>) },
      dataRetentionDays: org.dataRetentionDays,
      onboardingStep: org.onboardingStep,
      onboardingCompletedAt: org.onboardingCompletedAt?.toISOString() ?? null,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async create(userId: string, dto: CreateOrganizationDto, ctx: AuditContext): Promise<OrganizationSettings> {
    const base = slugify(dto.name);
    const org = await this.db.$transaction(async (tx) => {
      const taken = await tx.organization.count({ where: { slug: { startsWith: base } } });
      const created = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          slug:
            taken === 0
              ? base
              : `${base}-${generateToken(4)
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, '')}`,
          currencyCode: dto.currencyCode,
          timezone: dto.timezone,
          reportingPreferences: { ...DEFAULT_REPORTING_PREFERENCES },
          branding: { ...DEFAULT_BRANDING },
          onboardingStep: 1,
          memberships: { create: { userId, role: 'ORGANIZATION_ADMIN' } },
        },
      });
      await recordAudit(
        tx,
        { ...ctx, organizationId: created.id },
        { action: 'organization.created', entityType: 'Organization', entityId: created.id },
      );
      return created;
    });
    return this.toSettings(org);
  }

  async get(organizationId: string): Promise<OrganizationSettings> {
    return this.toSettings(await this.db.organization.findUniqueOrThrow({ where: { id: organizationId } }));
  }

  async update(
    organizationId: string,
    dto: UpdateOrganizationDto,
    ctx: AuditContext,
  ): Promise<OrganizationSettings> {
    const current = await this.db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const settings = this.toSettings(current);
    const data: Prisma.OrganizationUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.currencyCode !== undefined ? { currencyCode: dto.currencyCode } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.dataRetentionDays !== undefined ? { dataRetentionDays: dto.dataRetentionDays } : {}),
      ...(dto.reportingPreferences
        ? { reportingPreferences: { ...settings.reportingPreferences, ...dto.reportingPreferences } }
        : {}),
      ...(dto.branding ? { branding: { ...settings.branding, ...dto.branding } } : {}),
    };
    const updated = await this.db.organization.update({ where: { id: organizationId }, data });
    await recordAudit(this.db, ctx, {
      action: 'organization.updated',
      entityType: 'Organization',
      entityId: organizationId,
      metadata: {
        changes: diffFields(current, updated, ['name', 'currencyCode', 'timezone', 'dataRetentionDays']),
        updatedSections: Object.keys(dto).filter((k) => k === 'reportingPreferences' || k === 'branding'),
      },
    });
    return this.toSettings(updated);
  }

  async onboarding(
    organizationId: string,
    step: number,
    completed: boolean | undefined,
  ): Promise<OrganizationSettings> {
    const updated = await this.db.organization.update({
      where: { id: organizationId },
      data: { onboardingStep: step, ...(completed ? { onboardingCompletedAt: new Date() } : {}) },
    });
    return this.toSettings(updated);
  }

  async members(organizationId: string): Promise<MemberDto[]> {
    const members = await this.db.organizationMembership.findMany({
      where: { organizationId, user: { deletedAt: null } },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
    }));
  }

  private async assertNotLastAdmin(
    tx: Prisma.TransactionClient,
    organizationId: string,
    membershipId: string,
  ): Promise<void> {
    const admins = await tx.organizationMembership.findMany({
      where: { organizationId, role: 'ORGANIZATION_ADMIN' },
      select: { id: true },
    });
    if (admins.length === 1 && admins[0]?.id === membershipId) {
      throw new HttpException(
        { code: 'LAST_ADMIN', message: 'An organization must keep at least one administrator' },
        HttpStatus.CONFLICT,
      );
    }
  }

  async updateMember(
    organizationId: string,
    membershipId: string,
    role: OrgRole,
    actorRole: Role,
    ctx: AuditContext,
  ): Promise<MemberDto> {
    assertCanAssign(actorRole, role);
    await this.db.$transaction(async (tx) => {
      const member = await tx.organizationMembership.findFirst({
        where: { id: membershipId, organizationId },
      });
      if (!member) throw new NotFoundException('Member not found');
      assertCanAssign(actorRole, member.role);
      if (member.role === 'ORGANIZATION_ADMIN' && role !== 'ORGANIZATION_ADMIN')
        await this.assertNotLastAdmin(tx, organizationId, member.id);
      await tx.organizationMembership.update({ where: { id: member.id }, data: { role } });
      await recordAudit(tx, ctx, {
        action: 'member.role_changed',
        entityType: 'OrganizationMembership',
        entityId: member.id,
        metadata: { userId: member.userId, from: member.role, to: role },
      });
    });
    const members = await this.members(organizationId);
    const updated = members.find((m) => m.id === membershipId);
    if (!updated) throw new NotFoundException('Member not found');
    return updated;
  }

  async removeMember(
    organizationId: string,
    membershipId: string,
    actorRole: Role,
    ctx: AuditContext,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const member = await tx.organizationMembership.findFirst({
        where: { id: membershipId, organizationId },
      });
      if (!member) throw new NotFoundException('Member not found');
      assertCanAssign(actorRole, member.role);
      if (member.role === 'ORGANIZATION_ADMIN') await this.assertNotLastAdmin(tx, organizationId, member.id);
      await tx.organizationMembership.delete({ where: { id: member.id } });
      await recordAudit(tx, ctx, {
        action: 'member.removed',
        entityType: 'OrganizationMembership',
        entityId: member.id,
        metadata: { userId: member.userId },
      });
    });
  }

  async invitations(organizationId: string): Promise<InvitationDto[]> {
    const invites = await this.db.organizationInvitation.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { invitedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      invitedBy: i.invitedBy?.name ?? null,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    }));
  }

  async invite(
    organizationId: string,
    organizationName: string,
    inviter: { id: string; name: string },
    actorRole: Role,
    email: string,
    role: OrgRole,
    ctx: AuditContext,
  ): Promise<InvitationDto> {
    assertCanAssign(actorRole, role);
    const existingMember = await this.db.organizationMembership.findFirst({
      where: { organizationId, user: { email } },
    });
    if (existingMember)
      throw new HttpException(
        { code: 'ALREADY_MEMBER', message: 'This person is already a member' },
        HttpStatus.CONFLICT,
      );

    const token = generateToken(32);
    const invite = await this.db.$transaction(async (tx) => {
      await tx.organizationInvitation.updateMany({
        where: { organizationId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.organizationInvitation.create({
        data: {
          organizationId,
          email,
          role,
          tokenHash: hashToken(token),
          invitedById: inviter.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });
      await recordAudit(tx, ctx, {
        action: 'member.invited',
        entityType: 'OrganizationInvitation',
        entityId: created.id,
        metadata: { email, role },
      });
      return created;
    });
    const url = `${this.env.WEB_URL}/invitations/accept?token=${encodeURIComponent(token)}`;
    await this.queues.enqueueEmail(
      invitationEmail(email, organizationName, inviter.name, ROLE_LABELS[role], url),
    );
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      invitedBy: inviter.name,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };
  }

  async revokeInvitation(organizationId: string, invitationId: string, ctx: AuditContext): Promise<void> {
    const { count } = await this.db.organizationInvitation.updateMany({
      where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Invitation not found');
    await recordAudit(this.db, ctx, {
      action: 'member.invitation_revoked',
      entityType: 'OrganizationInvitation',
      entityId: invitationId,
    });
  }

  async previewInvitation(token: string) {
    const invite = await this.findValidInvitation(token);
    return {
      organizationName: invite.organization.name,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  /** The signed-in account must own the invited email, so a leaked link cannot be redeemed by someone else. */
  async acceptInvitation(user: { id: string; email: string }, token: string, ctx: AuditContext) {
    const invite = await this.findValidInvitation(token);
    if (invite.email !== user.email.toLowerCase()) {
      throw new ForbiddenException({
        code: 'INVITATION_EMAIL_MISMATCH',
        message: `This invitation was sent to ${invite.email}`,
      });
    }
    await this.db.$transaction(async (tx) => {
      await tx.organizationMembership.upsert({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } },
        update: {},
        create: { organizationId: invite.organizationId, userId: user.id, role: invite.role },
      });
      await tx.organizationInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      await recordAudit(
        tx,
        { ...ctx, organizationId: invite.organizationId },
        {
          action: 'member.joined',
          entityType: 'OrganizationInvitation',
          entityId: invite.id,
          metadata: { role: invite.role },
        },
      );
    });
    return {
      organizationId: invite.organizationId,
      organizationName: invite.organization.name,
      role: invite.role,
    };
  }

  private async findValidInvitation(token: string) {
    const invite = await this.db.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: true },
    });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt < new Date() ||
      invite.organization.deletedAt
    ) {
      throw new HttpException(
        { code: 'TOKEN_INVALID', message: 'This invitation is invalid or has expired' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return invite;
  }
}
