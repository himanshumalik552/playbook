import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Req, SuperAdminOnly } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto';
import { type AppRequest, auditContext } from '../../common/request-context';
import { FailedJobQueryDto, UpdateFeatureFlagDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@SuperAdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('health')
  @ApiOperation({ summary: 'Platform health, versions and volume counters' })
  health() {
    return this.admin.health();
  }

  @Get('organizations')
  @ApiOperation({ summary: 'All organizations' })
  organizations(@Query() query: PaginationQueryDto) {
    return this.admin.organizations(query);
  }

  @Get('users')
  @ApiOperation({ summary: 'All users' })
  users(@Query() query: PaginationQueryDto) {
    return this.admin.users(query);
  }

  @Post('users/:id/unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear a login lockout' })
  unlock(@Param('id') id: string, @Req() req: AppRequest) {
    return this.admin.unlockUser(id, auditContext(req));
  }

  @Get('feature-flags')
  @ApiOperation({ summary: 'Feature flags' })
  featureFlags() {
    return this.admin.featureFlags();
  }

  @Patch('feature-flags/:key')
  @ApiOperation({ summary: 'Toggle a feature flag globally or per organization' })
  updateFeatureFlag(@Param('key') key: string, @Body() dto: UpdateFeatureFlagDto, @Req() req: AppRequest) {
    return this.admin.updateFeatureFlag(key, dto, auditContext(req));
  }

  @Get('queues')
  @ApiOperation({ summary: 'Job counts per queue' })
  queues() {
    return this.admin.queueHealth();
  }

  @Get('failed-jobs')
  @ApiOperation({ summary: 'Dead-lettered jobs (retries exhausted)' })
  failedJobs(@Query() query: FailedJobQueryDto) {
    return this.admin.failedJobs(query);
  }

  @Post('failed-jobs/:id/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Re-enqueue a dead-lettered job on its original queue' })
  retry(@Param('id') id: string, @Req() req: AppRequest) {
    return this.admin.retryFailedJob(id, auditContext(req));
  }

  @Delete('failed-jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Discard a dead-lettered job' })
  discard(@Param('id') id: string, @Req() req: AppRequest) {
    return this.admin.discardFailedJob(id, auditContext(req));
  }

  @Get('sync-failures')
  @ApiOperation({ summary: 'Failed or partial synchronizations across organizations' })
  syncFailures(@Query() query: PaginationQueryDto) {
    return this.admin.syncFailures(query);
  }
}
