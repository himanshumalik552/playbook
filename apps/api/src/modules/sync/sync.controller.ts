import { Body, Controller, Get, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SYNC_STATUSES, type SyncStatus } from '@adpulse/types';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, Matches } from 'class-validator';
import type { Response } from 'express';
import { CurrentOrg, CurrentUser, Req, RequirePermissions } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto';
import { idempotencyKey } from '../../common/idempotency';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import { SyncService } from './sync.service';

const ID = /^[a-z0-9]{20,40}$/;

class SyncJobQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SYNC_STATUSES }) @IsOptional() @IsIn(SYNC_STATUSES) status?: SyncStatus;
  @ApiPropertyOptional() @IsOptional() @Matches(ID) adAccountId?: string;
}

class TriggerSyncDto {
  @ApiPropertyOptional({ type: [String], description: 'Defaults to every active account' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @Matches(ID, { each: true })
  adAccountIds?: string[];
}

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('jobs')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Synchronization history' })
  list(@CurrentOrg() org: OrgContext, @Query() query: SyncJobQueryDto) {
    return this.sync.list(org, query);
  }

  @Get('jobs/:id')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Synchronization job detail with errors' })
  get(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.sync.get(org, id);
  }

  @Post()
  @RequirePermissions('sync:trigger')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Start a manual sync of recent days (read-only import from Google Ads)' })
  async trigger(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: TriggerSyncDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.sync.trigger(
      org,
      user.id,
      dto.adAccountIds,
      idempotencyKey(req, 'sync'),
      auditContext(req),
    );
    res.status(result.created ? HttpStatus.ACCEPTED : HttpStatus.OK);
    return result;
  }
}
