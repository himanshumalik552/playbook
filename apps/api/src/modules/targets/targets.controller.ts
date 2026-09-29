import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, CurrentUser, Req, RequirePermissions } from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import { TargetHistoryQueryDto, UpsertTargetDto } from './targets.dto';
import { TargetsService } from './targets.service';

@ApiTags('targets')
@Controller('targets')
export class TargetsController {
  constructor(private readonly targets: TargetsService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Organization, account and campaign targets plus platform defaults' })
  list(@CurrentOrg() org: OrgContext) {
    return this.targets.list(org);
  }

  @Put()
  @RequirePermissions('targets:manage')
  @ApiOperation({ summary: 'Create or update a target (recorded in change history)' })
  upsert(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertTargetDto,
    @Req() req: AppRequest,
  ) {
    return this.targets.upsert(org, user.id, dto, auditContext(req));
  }

  @Delete(':id')
  @RequirePermissions('targets:manage')
  @ApiOperation({ summary: 'Remove a target override (falls back to the broader scope)' })
  async remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: AppRequest,
  ) {
    await this.targets.remove(org, user.id, id, auditContext(req));
    return { removed: true };
  }

  @Get('history')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Target change history' })
  history(@CurrentOrg() org: OrgContext, @Query() query: TargetHistoryQueryDto) {
    return this.targets.history(org, query.page, query.pageSize, query.campaignId);
  }
}
