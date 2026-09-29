import { Controller, Get, Param, ParseEnumPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, RequirePermissions } from '../../common/decorators';
import { MetricsQueryDto } from '../../common/dto';
import type { OrgContext } from '../../common/request-context';
import { type DashboardDimension, DashboardService } from './dashboard.service';

enum DashboardDimensionParam {
  campaign = 'campaign',
  adAccount = 'adAccount',
  device = 'device',
  location = 'location',
  objective = 'objective',
}

@ApiTags('dashboard')
@Controller('dashboard')
@RequirePermissions('analytics:read')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'KPI totals, period comparison and daily trend for the selected filters' })
  overview(@CurrentOrg() org: OrgContext, @Query() query: MetricsQueryDto) {
    return this.dashboard.overview(org, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Open alerts, recommendations, recent actions and last sync' })
  summary(@CurrentOrg() org: OrgContext) {
    return this.dashboard.summary(org);
  }

  @Get('filters')
  @ApiOperation({ summary: 'Available filter options for the active organization' })
  filters(@CurrentOrg() org: OrgContext) {
    return this.dashboard.filters(org);
  }

  @Get('breakdown/:dimension')
  @ApiParam({ name: 'dimension', enum: DashboardDimensionParam })
  @ApiOperation({ summary: 'Performance grouped by campaign, account, device, location or objective' })
  breakdown(
    @CurrentOrg() org: OrgContext,
    @Param('dimension', new ParseEnumPipe(DashboardDimensionParam)) dimension: DashboardDimension,
    @Query() query: MetricsQueryDto,
  ) {
    return this.dashboard.breakdown(org, query, dimension);
  }
}
