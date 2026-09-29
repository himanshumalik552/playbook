import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, CurrentUser, Public, Req, RequirePermissions, SkipOrg } from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import { UsersService } from '../users/users.service';
import {
  AcceptInvitationDto,
  CreateOrganizationDto,
  InviteMemberDto,
  OnboardingDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
} from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @SkipOrg()
  @ApiOperation({ summary: 'Organizations the current user belongs to' })
  async list(@CurrentUser() user: AuthUser) {
    return (await this.users.currentUser(user.id)).memberships;
  }

  @Post()
  @SkipOrg()
  @ApiOperation({ summary: 'Create an organization; the creator becomes its administrator' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto, @Req() req: AppRequest) {
    return this.organizations.create(user.id, dto, auditContext(req));
  }

  @Get('current')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Active organization settings' })
  current(@CurrentOrg() org: OrgContext) {
    return this.organizations.get(org.organizationId);
  }

  @Patch('current')
  @RequirePermissions('organization:manage')
  @ApiOperation({ summary: 'Update organization settings' })
  update(@CurrentOrg() org: OrgContext, @Body() dto: UpdateOrganizationDto, @Req() req: AppRequest) {
    return this.organizations.update(org.organizationId, dto, auditContext(req));
  }

  @Post('current/onboarding')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('organization:manage')
  @ApiOperation({ summary: 'Record onboarding progress' })
  onboarding(@CurrentOrg() org: OrgContext, @Body() dto: OnboardingDto) {
    return this.organizations.onboarding(org.organizationId, dto.step, dto.completed);
  }
}

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Members of the active organization' })
  members(@CurrentOrg() org: OrgContext) {
    return this.organizations.members(org.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('members:manage')
  @ApiOperation({ summary: 'Change a member role' })
  updateMember(
    @CurrentOrg() org: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
    @Req() req: AppRequest,
  ) {
    return this.organizations.updateMember(org.organizationId, id, dto.role, org.role, auditContext(req));
  }

  @Delete(':id')
  @RequirePermissions('members:manage')
  @ApiOperation({ summary: 'Remove a member' })
  async removeMember(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Req() req: AppRequest) {
    await this.organizations.removeMember(org.organizationId, id, org.role, auditContext(req));
    return { removed: true };
  }
}

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @RequirePermissions('members:manage')
  @ApiOperation({ summary: 'Pending invitations of the active organization' })
  invitations(@CurrentOrg() org: OrgContext) {
    return this.organizations.invitations(org.organizationId);
  }

  @Post()
  @RequirePermissions('members:manage')
  @ApiOperation({ summary: 'Invite a team member by email' })
  invite(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteMemberDto,
    @Req() req: AppRequest,
  ) {
    return this.organizations.invite(
      org.organizationId,
      org.organizationName,
      user,
      org.role,
      dto.email,
      dto.role,
      auditContext(req),
    );
  }

  @Delete(':id')
  @RequirePermissions('members:manage')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revokeInvitation(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Req() req: AppRequest) {
    await this.organizations.revokeInvitation(org.organizationId, id, auditContext(req));
    return { revoked: true };
  }

  @Post('preview')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Look up an invitation by token (organization name, invited email, role)' })
  preview(@Body() dto: AcceptInvitationDto) {
    return this.organizations.previewInvitation(dto.token);
  }

  @Post('accept')
  @SkipOrg()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation as the signed-in user' })
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptInvitationDto, @Req() req: AppRequest) {
    return this.organizations.acceptInvitation(user, dto.token, auditContext(req));
  }
}
