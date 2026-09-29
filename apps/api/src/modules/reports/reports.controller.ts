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
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentOrg, CurrentUser, Req, RequirePermissions } from '../../common/decorators';
import { idempotencyKey } from '../../common/idempotency';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import {
  GenerateReportDto,
  ReportListQueryDto,
  ReportScopeDto,
  TemplateDto,
  UpdateTemplateDto,
} from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Generated report history' })
  list(@CurrentOrg() org: OrgContext, @Query() query: ReportListQueryDto) {
    return this.reports.list(org, query);
  }

  @Get('sections')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Sections included in reports, in rendering order' })
  sections() {
    return this.reports.sections();
  }

  @Get('preview')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Report content as JSON for on-screen preview' })
  preview(@CurrentOrg() org: OrgContext, @Query() query: ReportScopeDto) {
    return this.reports.preview(org, query);
  }

  @Post()
  @RequirePermissions('reports:generate')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Repeating a request with the same key returns the original report',
  })
  @ApiOperation({ summary: 'Queue a PDF or Excel report' })
  async generate(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateReportDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.generate(
      org,
      user.id,
      dto,
      idempotencyKey(req, 'report'),
      auditContext(req),
    );
    res.status(result.created ? HttpStatus.ACCEPTED : HttpStatus.OK);
    return result.report;
  }

  @Get('templates')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Report templates and schedules' })
  templates(@CurrentOrg() org: OrgContext) {
    return this.reports.templates(org);
  }

  @Post('templates')
  @RequirePermissions('reports:schedule')
  @ApiOperation({ summary: 'Create a report template' })
  createTemplate(@CurrentOrg() org: OrgContext, @Body() dto: TemplateDto, @Req() req: AppRequest) {
    return this.reports.createTemplate(org, dto, auditContext(req));
  }

  @Patch('templates/:id')
  @RequirePermissions('reports:schedule')
  @ApiOperation({ summary: 'Update a template, its schedule or recipients' })
  updateTemplate(
    @CurrentOrg() org: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @Req() req: AppRequest,
  ) {
    return this.reports.updateTemplate(org, id, dto, auditContext(req));
  }

  @Delete('templates/:id')
  @RequirePermissions('reports:schedule')
  @ApiOperation({ summary: 'Delete a custom template' })
  async deleteTemplate(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Req() req: AppRequest) {
    await this.reports.deleteTemplate(org, id, auditContext(req));
    return { deleted: true };
  }

  @Get(':id')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Report status' })
  get(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.reports.get(org, id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('reports:generate')
  @ApiOperation({ summary: 'Retry a failed report' })
  retry(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Req() req: AppRequest) {
    return this.reports.retry(org, id, auditContext(req));
  }

  @Get(':id/download')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Download a completed report' })
  async download(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Req() req: AppRequest) {
    const file = await this.reports.download(org, id, auditContext(req));
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
      length: file.body.length,
    });
  }
}
