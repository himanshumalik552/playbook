import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, CurrentUser, Req, RequirePermissions } from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import { AlertListQueryDto, BulkUpdateAlertsDto, UpdateAlertDto, UpdateAlertRuleDto } from './alerts.dto';
import { AlertsService } from './alerts.service';

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Alerts with filters' })
  list(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Query() query: AlertListQueryDto) {
    return this.alerts.list(org, user.id, query);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('alerts:update', 'alerts:bulk')
  @ApiOperation({ summary: 'Update status/assignee of up to 200 alerts' })
  bulk(@CurrentOrg() org: OrgContext, @Body() dto: BulkUpdateAlertsDto, @Req() req: AppRequest) {
    const { ids, ...changes } = dto;
    return this.alerts.bulkUpdate(org, ids, changes, auditContext(req));
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('sync:trigger')
  @ApiOperation({ summary: 'Queue an alert evaluation run' })
  evaluate(@CurrentOrg() org: OrgContext, @Req() req: AppRequest) {
    return this.alerts.requestEvaluation(org, auditContext(req));
  }

  @Get(':id')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Alert detail' })
  get(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.alerts.get(org, id);
  }

  @Patch(':id')
  @RequirePermissions('alerts:update')
  @ApiOperation({ summary: 'Acknowledge, resolve, dismiss, reopen or assign an alert' })
  update(
    @CurrentOrg() org: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateAlertDto,
    @Req() req: AppRequest,
  ) {
    return this.alerts.update(org, id, dto, auditContext(req));
  }
}

@ApiTags('alerts')
@Controller('alert-rules')
export class AlertRulesController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Alert rules for the organization (defaults are created on first access)' })
  list(@CurrentOrg() org: OrgContext) {
    return this.alerts.rules(org);
  }

  @Patch(':id')
  @RequirePermissions('alert-rules:manage')
  @ApiOperation({ summary: 'Enable/disable a rule or change its severity and thresholds' })
  update(
    @CurrentOrg() org: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateAlertRuleDto,
    @Req() req: AppRequest,
  ) {
    return this.alerts.updateRule(org, id, dto, auditContext(req));
  }

  @Post(':id/reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('alert-rules:manage')
  @ApiOperation({ summary: 'Restore default settings for a rule' })
  reset(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Req() req: AppRequest) {
    return this.alerts.resetRule(org, id, auditContext(req));
  }
}
