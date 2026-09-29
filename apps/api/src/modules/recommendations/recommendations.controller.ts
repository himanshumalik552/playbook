import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, CurrentUser, Req, RequirePermissions } from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import {
  ConvertRecommendationDto,
  CreateRecommendationDto,
  DismissRecommendationDto,
  RecommendationListQueryDto,
} from './recommendations.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Recommendations ordered by confidence' })
  list(@CurrentOrg() org: OrgContext, @Query() query: RecommendationListQueryDto) {
    return this.recommendations.list(org, query);
  }

  @Post()
  @RequirePermissions('recommendations:create')
  @ApiOperation({ summary: 'Record a manual, evidence-backed recommendation' })
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRecommendationDto,
    @Req() req: AppRequest,
  ) {
    return this.recommendations.create(org, { userId: user.id, role: org.role }, dto, auditContext(req));
  }

  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('sync:trigger')
  @ApiOperation({ summary: 'Queue a recommendation generation run' })
  generate(@CurrentOrg() org: OrgContext, @Req() req: AppRequest) {
    return this.recommendations.requestGeneration(org, auditContext(req));
  }

  @Get(':id')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Recommendation detail with evidence' })
  get(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.recommendations.get(org, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('recommendations:decide')
  @ApiOperation({ summary: 'Approve a recommendation for follow-up' })
  approve(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: AppRequest,
  ) {
    return this.recommendations.approve(org, { userId: user.id, role: org.role }, id, auditContext(req));
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('recommendations:decide')
  @ApiOperation({ summary: 'Dismiss a recommendation with a reason' })
  dismiss(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DismissRecommendationDto,
    @Req() req: AppRequest,
  ) {
    return this.recommendations.dismiss(
      org,
      { userId: user.id, role: org.role },
      id,
      dto.reason,
      auditContext(req),
    );
  }

  @Post(':id/convert')
  @RequirePermissions('recommendations:decide', 'actions:create')
  @ApiOperation({ summary: 'Convert into an optimization action (a plan; nothing is changed in Google Ads)' })
  convert(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertRecommendationDto,
    @Req() req: AppRequest,
  ) {
    return this.recommendations.convert(org, { userId: user.id, role: org.role }, id, dto, auditContext(req));
  }
}
