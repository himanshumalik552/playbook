import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, RequirePermissions } from '../../common/decorators';
import type { OrgContext } from '../../common/request-context';
import { AuditLogQueryDto } from './audit-logs.dto';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditLogsService) {}

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Immutable audit trail of the current organization' })
  list(@CurrentOrg() org: OrgContext, @Query() query: AuditLogQueryDto) {
    return this.audit.list(org, query);
  }
}
