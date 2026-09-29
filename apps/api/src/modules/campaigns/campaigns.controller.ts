import { Controller, Get, Param, ParseEnumPipe, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { CAMPAIGN_STATUSES, type CampaignStatus } from '@adpulse/types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { csvFilename } from '../../common/csv';
import { CurrentOrg, RequirePermissions } from '../../common/decorators';
import { MetricsPageQueryDto, MetricsQueryDto, PaginationQueryDto } from '../../common/dto';
import type { OrgContext } from '../../common/request-context';
import { type CampaignBreakdown, CampaignsService } from './campaigns.service';

class CampaignListQueryDto extends MetricsPageQueryDto {
  @ApiPropertyOptional({ enum: CAMPAIGN_STATUSES })
  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: CampaignStatus;
}

class CampaignExportQueryDto extends MetricsQueryDto {
  @ApiPropertyOptional({ enum: CAMPAIGN_STATUSES })
  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: CampaignStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

enum CampaignBreakdownParam {
  adGroup = 'adGroup',
  keyword = 'keyword',
  searchTerm = 'searchTerm',
  device = 'device',
  location = 'location',
  landingPage = 'landingPage',
}

@ApiTags('campaigns')
@Controller('campaigns')
@RequirePermissions('analytics:read')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'Campaign performance table with period comparison' })
  list(@CurrentOrg() org: OrgContext, @Query() query: CampaignListQueryDto) {
    return this.campaigns.list(org, query);
  }

  @Get('export')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export the filtered campaign table as CSV' })
  async export(@CurrentOrg() org: OrgContext, @Query() query: CampaignExportQueryDto) {
    const csv = await this.campaigns.exportCsv(org, query);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${csvFilename('campaigns', query)}"`,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Campaign detail with trend, impression share and effective targets' })
  detail(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Query() query: MetricsQueryDto) {
    return this.campaigns.detail(org, id, query);
  }

  @Get(':id/breakdown/:dimension')
  @ApiParam({ name: 'dimension', enum: CampaignBreakdownParam })
  @ApiOperation({
    summary: 'Campaign performance by ad group, keyword, search term, device, location or landing page',
  })
  breakdown(
    @CurrentOrg() org: OrgContext,
    @Param('id') id: string,
    @Param('dimension', new ParseEnumPipe(CampaignBreakdownParam)) dimension: CampaignBreakdown,
    @Query() query: MetricsQueryDto,
  ) {
    return this.campaigns.breakdown(org, id, dimension, query);
  }

  @Get(':id/changes')
  @ApiOperation({ summary: 'Change history (targets, notes, synchronized attribute changes)' })
  changes(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.campaigns.changes(org, id, query.page, query.pageSize);
  }
}
