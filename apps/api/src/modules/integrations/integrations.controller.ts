import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppEnv } from '@adpulse/config';
import { type Logger, redactSecrets } from '@adpulse/core';
import type { Response } from 'express';
import {
  CurrentOrg,
  CurrentUser,
  Public,
  Req,
  RequirePermissions,
  SkipCsrf,
  SkipOrg,
} from '../../common/decorators';
import { type AppRequest, auditContext, type AuthUser, type OrgContext } from '../../common/request-context';
import { APP_ENV, LOGGER } from '../../infra/tokens';
import { type CookieSettings, OAUTH_STATE_COOKIE, readCookie } from '../auth/auth-cookies';
import { ProviderDto, SelectAccountsDto, SelectPropertiesDto, UpdateAdAccountDto } from './integrations.dto';
import { IntegrationsService } from './integrations.service';

const STATE_COOKIE_PATH = '/api/v1/integrations/google';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  private readonly cookies: CookieSettings;

  constructor(
    private readonly integrations: IntegrationsService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.cookies = { secure: env.COOKIE_SECURE, ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}) };
  }

  @Get()
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Integration mode and connections of the current organization' })
  overview(@CurrentOrg() org: OrgContext) {
    return this.integrations.overview(org);
  }

  @Post('google/connect')
  @RequirePermissions('integrations:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start a read-only Google Ads or GA4 authorization; returns the consent URL to navigate to',
  })
  connect(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: ProviderDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { url, cookie } = this.integrations.startGoogleConnect(org, user.id, dto.provider);
    res.cookie(OAUTH_STATE_COOKIE, cookie, {
      ...this.cookies,
      httpOnly: true,
      sameSite: 'lax',
      path: STATE_COOKIE_PATH,
      maxAge: 600_000,
    });
    return { url };
  }

  @Public()
  @SkipOrg()
  @SkipCsrf()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google authorization callback (browser redirect)' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: AppRequest,
    @Res() res: Response,
  ) {
    res.clearCookie(OAUTH_STATE_COOKIE, { ...this.cookies, path: STATE_COOKIE_PATH });
    const target = new URL('/integrations', this.env.WEB_URL);
    if (error) {
      target.searchParams.set('error', error.slice(0, 50));
      return res.redirect(target.toString());
    }
    try {
      const result = await this.integrations.completeGoogleConnect(
        { code, state },
        readCookie(req, OAUTH_STATE_COOKIE),
        auditContext(req),
      );
      target.searchParams.set('connected', result.provider);
      target.searchParams.set('connectionId', result.connectionId);
    } catch (err) {
      this.logger.warn(
        { err: redactSecrets(err instanceof Error ? err.message : String(err)), requestId: req.requestId },
        'Google integration callback failed',
      );
      target.searchParams.set('error', 'connect_failed');
    }
    return res.redirect(target.toString());
  }

  @Post('demo')
  @RequirePermissions('integrations:manage')
  @ApiOperation({ summary: 'Connect the deterministic demo data source (INTEGRATION_MODE=mock only)' })
  connectDemo(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: ProviderDto,
    @Req() req: AppRequest,
  ) {
    return this.integrations.connectDemo(org, user.id, dto.provider, auditContext(req));
  }

  @Get(':id/accounts')
  @RequirePermissions('integrations:manage')
  @ApiOperation({ summary: 'Google Ads accounts accessible through this connection' })
  accessibleAccounts(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.integrations.accessibleAccounts(org, id);
  }

  @Put(':id/accounts')
  @RequirePermissions('integrations:manage')
  @ApiOperation({
    summary: 'Choose which accounts to import; newly selected accounts get an initial backfill',
  })
  selectAccounts(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SelectAccountsDto,
    @Req() req: AppRequest,
  ) {
    return this.integrations.selectAccounts(org, user.id, id, dto.customerIds, auditContext(req));
  }

  @Get(':id/properties')
  @RequirePermissions('integrations:manage')
  @ApiOperation({ summary: 'GA4 properties accessible through this connection' })
  properties(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.integrations.properties(org, id);
  }

  @Put(':id/properties')
  @RequirePermissions('integrations:manage')
  @ApiOperation({ summary: 'Link GA4 properties to ad accounts' })
  selectProperties(
    @CurrentOrg() org: OrgContext,
    @Param('id') id: string,
    @Body() dto: SelectPropertiesDto,
    @Req() req: AppRequest,
  ) {
    return this.integrations.selectProperties(org, id, dto.links, auditContext(req));
  }

  @Delete(':id')
  @RequirePermissions('integrations:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect: revokes the Google grant and deletes the stored token' })
  disconnect(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Req() req: AppRequest) {
    return this.integrations.disconnect(org, id, auditContext(req));
  }
}

@ApiTags('ad-accounts')
@Controller('ad-accounts')
export class AdAccountsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Ad accounts of the current organization' })
  list(@CurrentOrg() org: OrgContext) {
    return this.integrations.adAccounts(org);
  }

  @Patch(':id')
  @RequirePermissions('integrations:manage')
  @ApiOperation({ summary: 'Pause or resume importing an ad account' })
  update(
    @CurrentOrg() org: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateAdAccountDto,
    @Req() req: AppRequest,
  ) {
    return this.integrations.setAccountActive(org, id, dto.isActive, auditContext(req));
  }
}
