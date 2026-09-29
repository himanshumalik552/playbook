import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, CurrentUser, Req, RequirePermissions } from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import { EntityListQueryDto, ReviewSearchTermDto, SearchTermQueryDto } from './performance.dto';
import { PerformanceService } from './performance.service';

@ApiTags('performance')
@Controller()
@RequirePermissions('analytics:read')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('ad-groups')
  @ApiOperation({ summary: 'Ad groups with activity in the selected range' })
  adGroups(@CurrentOrg() org: OrgContext, @Query() query: EntityListQueryDto) {
    return this.performance.adGroups(org, query);
  }

  @Get('keywords')
  @ApiOperation({ summary: 'Keywords with activity in the selected range' })
  keywords(@CurrentOrg() org: OrgContext, @Query() query: EntityListQueryDto) {
    return this.performance.keywords(org, query);
  }

  @Get('search-terms')
  @ApiOperation({
    summary: 'Search terms with review flags (suggestions only; nothing is applied to Google Ads)',
  })
  searchTerms(@CurrentOrg() org: OrgContext, @Query() query: SearchTermQueryDto) {
    return this.performance.searchTerms(org, query);
  }

  @Patch('search-terms/:id/review')
  @RequirePermissions('search-terms:review')
  @ApiOperation({ summary: 'Record or clear a manual review decision for a search term' })
  review(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewSearchTermDto,
    @Req() req: AppRequest,
  ) {
    return this.performance.reviewSearchTerm(org, user.id, id, dto.reviewed, dto.note, auditContext(req));
  }

  @Get('landing-pages')
  @ApiOperation({ summary: 'Landing pages with Google Ads metrics and joined GA4 engagement' })
  landingPages(@CurrentOrg() org: OrgContext, @Query() query: EntityListQueryDto) {
    return this.performance.landingPages(org, query);
  }
}
