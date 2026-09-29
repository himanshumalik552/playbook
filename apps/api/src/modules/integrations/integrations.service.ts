import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppEnv } from '@adpulse/config';
import {
  type AuditContext,
  EncryptionService,
  GOOGLE_SCOPES,
  type JobQueues,
  type Logger,
  planSyncJobs,
  ProviderFactory,
  recordAudit,
  redactSecrets,
} from '@adpulse/core';
import type { OAuthConnection } from '@adpulse/database';
import {
  type AccessibleCustomerDto,
  type AdAccountDto,
  type AnalyticsPropertyDto,
  hasPermission,
  type IntegrationConnectionDto,
  type IntegrationOverviewDto,
  type IntegrationProvider,
} from '@adpulse/types';
import { iso } from '../../common/mappers';
import type { OrgContext } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma.service';
import { APP_ENV, ENCRYPTION, JOB_QUEUES, LOGGER, PROVIDERS } from '../../infra/tokens';
import { createOAuthState, type OAuthPurpose, verifyOAuthState } from '../auth/oauth-state';

const PURPOSE: Record<IntegrationProvider, Extract<OAuthPurpose, 'ads' | 'analytics'>> = {
  GOOGLE_ADS: 'ads',
  GOOGLE_ANALYTICS: 'analytics',
};
const PROVIDER_BY_PURPOSE = { ads: 'GOOGLE_ADS', analytics: 'GOOGLE_ANALYTICS' } as const;

function toConnectionDto(c: OAuthConnection): IntegrationConnectionDto {
  return {
    id: c.id,
    provider: c.provider,
    status: c.status,
    isMock: c.isMock,
    externalEmail: c.externalEmail,
    scopes: c.scopes,
    lastSuccessfulSyncAt: iso(c.lastSuccessfulSyncAt),
    lastError: c.lastError,
    connectedAt: c.createdAt.toISOString(),
  };
}

export function toAdAccountDto(a: {
  id: string;
  customerId: string;
  managerCustomerId: string | null;
  name: string;
  currencyCode: string;
  timezone: string;
  isManager: boolean;
  isActive: boolean;
  lastSyncedAt: Date | null;
}): AdAccountDto {
  return {
    id: a.id,
    customerId: a.customerId,
    managerCustomerId: a.managerCustomerId,
    name: a.name,
    currencyCode: a.currencyCode,
    timezone: a.timezone,
    isManager: a.isManager,
    isActive: a.isActive,
    lastSyncedAt: iso(a.lastSyncedAt),
  };
}

/**
 * Integrations are read-only: the platform imports reporting data and never writes campaigns, budgets,
 * bids, keywords or targeting back to Google Ads.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(PROVIDERS) private readonly providers: ProviderFactory,
    @Inject(ENCRYPTION) private readonly encryption: EncryptionService,
    @Inject(JOB_QUEUES) private readonly queues: JobQueues,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async overview(org: OrgContext): Promise<IntegrationOverviewDto> {
    const connections = await this.db.oAuthConnection.findMany({
      where: { organizationId: org.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      mode: this.env.INTEGRATION_MODE,
      googleConfigured:
        this.env.INTEGRATION_MODE === 'google' &&
        this.providers.googleAdsConfigured &&
        Boolean(this.env.GOOGLE_INTEGRATION_REDIRECT_URI),
      connections: connections.map(toConnectionDto),
    };
  }

  private async connection(organizationId: string, id: string): Promise<OAuthConnection> {
    const connection = await this.db.oAuthConnection.findFirst({ where: { id, organizationId } });
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.status === 'REVOKED')
      throw new HttpException(
        { code: 'INVALID_STATE', message: 'This connection has been disconnected' },
        HttpStatus.CONFLICT,
      );
    return connection;
  }

  private refreshToken(connection: OAuthConnection): string | null {
    return connection.encryptedRefreshToken
      ? this.encryption.decrypt(connection.encryptedRefreshToken, connection.id)
      : null;
  }

  /* ----------------------------- Google OAuth (live mode) ----------------------------- */

  startGoogleConnect(
    org: OrgContext,
    userId: string,
    provider: IntegrationProvider,
  ): { url: string; cookie: string } {
    const redirectUri = this.env.GOOGLE_INTEGRATION_REDIRECT_URI;
    const ready =
      provider === 'GOOGLE_ADS' ? this.providers.googleAdsConfigured : this.providers.googleConfigured;
    if (this.env.INTEGRATION_MODE !== 'google' || !ready || !redirectUri) {
      throw new HttpException(
        {
          code: 'INTEGRATION_UNAVAILABLE',
          message:
            'Live Google integration is not configured on this server. Use the demo connection, or set INTEGRATION_MODE=google with Google OAuth credentials.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const { state, cookie, codeChallenge } = createOAuthState(this.env.JWT_REFRESH_SECRET, {
      purpose: PURPOSE[provider],
      userId,
      organizationId: org.organizationId,
    });
    const scopes = provider === 'GOOGLE_ADS' ? GOOGLE_SCOPES.ads : GOOGLE_SCOPES.analytics;
    return {
      url: this.providers.oauth().buildAuthUrl({ redirectUri, scopes, state, codeChallenge, offline: true }),
      cookie,
    };
  }

  /**
   * Completes the OAuth callback. User and organization come from the signed, browser-bound state (the
   * access cookie may have expired during consent), so the user, membership and permission are re-checked.
   */
  async completeGoogleConnect(
    query: { code?: string; state?: string },
    stateCookie: string | undefined,
    ctx: AuditContext,
  ): Promise<{ provider: IntegrationProvider; connectionId: string }> {
    const secret = this.env.JWT_REFRESH_SECRET;
    const verified = (['ads', 'analytics'] as const)
      .map((purpose) => ({ purpose, payload: verifyOAuthState(secret, query.state, stateCookie, purpose) }))
      .find((v) => v.payload !== null);
    const purpose = verified?.purpose;
    const payload = verified?.payload;
    const redirectUri = this.env.GOOGLE_INTEGRATION_REDIRECT_URI;
    if (!purpose || !payload?.organizationId || !payload.userId || !query.code || !redirectUri) {
      throw new BadRequestException({
        code: 'OAUTH_STATE_INVALID',
        message: 'The connection request expired or was tampered with',
      });
    }
    const organizationId = payload.organizationId;
    const user = await this.db.user.findFirst({
      where: { id: payload.userId, deletedAt: null },
      select: { id: true, systemRole: true },
    });
    if (!user) throw new ForbiddenException('User not found');
    const membership = await this.db.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
    });
    const role = membership?.role ?? (user.systemRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : null);
    if (!hasPermission(role, 'integrations:manage'))
      throw new ForbiddenException('You cannot manage integrations for this organization');

    const oauth = this.providers.oauth();
    const tokens = await oauth.exchangeCode(query.code, redirectUri, payload.verifier);
    const refreshToken = tokens.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException({
        code: 'NO_REFRESH_TOKEN',
        message:
          'Google did not grant offline access. Remove ADPULSE from your Google account permissions and connect again.',
      });
    }
    const identity = tokens.idToken ? await oauth.verifyIdToken(tokens.idToken) : null;
    const provider = PROVIDER_BY_PURPOSE[purpose];
    const scopes = tokens.scope.split(' ').filter(Boolean);

    const connection = await this.db.$transaction(async (tx) => {
      const existing = await tx.oAuthConnection.findFirst({
        where: { organizationId, provider, isMock: false, status: { not: 'REVOKED' } },
      });
      const row =
        existing ??
        (await tx.oAuthConnection.create({
          data: { organizationId, provider, isMock: false, scopes, connectedById: user.id },
        }));
      // The connection id is bound as associated data, so a ciphertext copied to another row fails to decrypt.
      const updated = await tx.oAuthConnection.update({
        where: { id: row.id },
        data: {
          encryptedRefreshToken: this.encryption.encrypt(refreshToken, row.id),
          externalEmail: identity?.email ?? null,
          scopes,
          status: 'ACTIVE',
          lastError: null,
          revokedAt: null,
          connectedById: user.id,
        },
      });
      await recordAudit(
        tx,
        { ...ctx, actorId: user.id, organizationId },
        {
          action: existing ? 'integration.reconnected' : 'integration.connected',
          entityType: 'OAuthConnection',
          entityId: updated.id,
          metadata: { provider, scopes },
        },
      );
      return updated;
    });
    return { provider, connectionId: connection.id };
  }

  /* ----------------------------- Demo (mock) mode ----------------------------- */

  /** Creates a mock connection backed by the deterministic demo dataset. No credentials are involved. */
  async connectDemo(
    org: OrgContext,
    userId: string,
    provider: IntegrationProvider,
    ctx: AuditContext,
  ): Promise<IntegrationConnectionDto> {
    if (this.env.INTEGRATION_MODE !== 'mock') {
      throw new HttpException(
        {
          code: 'INTEGRATION_UNAVAILABLE',
          message: 'Demo connections are only available when INTEGRATION_MODE=mock',
        },
        HttpStatus.CONFLICT,
      );
    }
    const existing = await this.db.oAuthConnection.findFirst({
      where: { organizationId: org.organizationId, provider, isMock: true, status: { not: 'REVOKED' } },
    });
    if (existing) return toConnectionDto(existing);
    const connection = await this.db.oAuthConnection.create({
      data: {
        organizationId: org.organizationId,
        provider,
        isMock: true,
        externalEmail: provider === 'GOOGLE_ADS' ? 'demo-ads@adpulse.local' : 'demo-analytics@adpulse.local',
        scopes:
          provider === 'GOOGLE_ADS'
            ? ['https://www.googleapis.com/auth/adwords']
            : ['https://www.googleapis.com/auth/analytics.readonly'],
        connectedById: userId,
      },
    });
    await recordAudit(this.db, ctx, {
      action: 'integration.demo_connected',
      entityType: 'OAuthConnection',
      entityId: connection.id,
      metadata: { provider },
    });
    return toConnectionDto(connection);
  }

  /* ----------------------------- Accounts & properties ----------------------------- */

  async accessibleAccounts(
    org: OrgContext,
    connectionId: string,
  ): Promise<(AccessibleCustomerDto & { selected: boolean })[]> {
    const connection = await this.connection(org.organizationId, connectionId);
    if (connection.provider !== 'GOOGLE_ADS') throw new BadRequestException('Not a Google Ads connection');
    const customers = await this.providers.ads(connection).listAccessibleCustomers({
      refreshToken: this.refreshToken(connection),
      loginCustomerId: this.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null,
    });
    const selected = await this.db.adAccount.findMany({
      where: { organizationId: org.organizationId, connectionId: connection.id, isActive: true },
      select: { customerId: true },
    });
    const active = new Set(selected.map((a) => a.customerId));
    return customers.map((c) => ({
      customerId: c.customerId,
      name: c.descriptiveName,
      currencyCode: c.currencyCode,
      timezone: c.timeZone,
      isManager: c.manager,
      managerCustomerId: c.managerCustomerId,
      selected: active.has(c.customerId),
    }));
  }

  /** Imports the chosen accounts and queues an initial backfill for newly activated ones. */
  async selectAccounts(
    org: OrgContext,
    userId: string,
    connectionId: string,
    customerIds: string[],
    ctx: AuditContext,
  ) {
    const connection = await this.connection(org.organizationId, connectionId);
    if (connection.provider !== 'GOOGLE_ADS') throw new BadRequestException('Not a Google Ads connection');
    const customers = await this.providers.ads(connection).listAccessibleCustomers({
      refreshToken: this.refreshToken(connection),
      loginCustomerId: this.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null,
    });
    const wanted = new Set(customerIds);
    const unknown = customerIds.filter((id) => !customers.some((c) => c.customerId === id));
    if (unknown.length > 0)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some accounts are not accessible with this connection',
        details: { unknown },
      });
    if (customers.some((c) => wanted.has(c.customerId) && c.manager)) {
      throw new BadRequestException(
        'Manager (MCC) accounts have no metrics of their own; select their client accounts instead',
      );
    }

    const newlyActive: string[] = [];
    await this.db.$transaction(async (tx) => {
      for (const c of customers) {
        const existing = await tx.adAccount.findUnique({
          where: {
            organizationId_customerId: { organizationId: org.organizationId, customerId: c.customerId },
          },
        });
        if (
          existing &&
          existing.connectionId !== connection.id &&
          existing.connectionId !== null &&
          existing.isActive
        ) {
          if (wanted.has(c.customerId))
            throw new BadRequestException(
              `Account ${c.customerId} is already imported through another connection`,
            );
          continue;
        }
        const isActive = wanted.has(c.customerId);
        const account = await tx.adAccount.upsert({
          where: {
            organizationId_customerId: { organizationId: org.organizationId, customerId: c.customerId },
          },
          update: {
            connectionId: connection.id,
            name: c.descriptiveName,
            managerCustomerId: c.managerCustomerId,
            isManager: c.manager,
            isActive,
          },
          create: {
            organizationId: org.organizationId,
            connectionId: connection.id,
            customerId: c.customerId,
            managerCustomerId: c.managerCustomerId,
            name: c.descriptiveName,
            currencyCode: c.currencyCode,
            timezone: c.timeZone,
            isManager: c.manager,
            isActive,
          },
        });
        if (isActive && (!existing?.isActive || !existing.lastSyncedAt)) newlyActive.push(account.id);
      }
      await recordAudit(tx, ctx, {
        action: 'integration.accounts_selected',
        entityType: 'OAuthConnection',
        entityId: connection.id,
        metadata: { customerIds },
      });
    });

    let queued = 0;
    if (newlyActive.length > 0) {
      const { jobs } = await planSyncJobs(this.db, {
        organizationId: org.organizationId,
        type: 'INITIAL',
        adAccountIds: newlyActive,
        triggeredById: userId,
        lookbackDays: this.env.SYNC_LOOKBACK_DAYS,
        initialDays: this.env.INITIAL_SYNC_DAYS,
      });
      for (const job of jobs.filter((j) => j.status === 'QUEUED')) {
        await this.queues.enqueueAdsSync({ syncJobId: job.id, organizationId: org.organizationId });
        queued += 1;
      }
    }
    return { accounts: await this.adAccounts(org), initialSyncsQueued: queued };
  }

  async properties(org: OrgContext, connectionId: string) {
    const connection = await this.connection(org.organizationId, connectionId);
    if (connection.provider !== 'GOOGLE_ANALYTICS')
      throw new BadRequestException('Not a Google Analytics connection');
    const [available, linked] = await Promise.all([
      this.providers
        .analytics(connection)
        .listProperties({ refreshToken: this.refreshToken(connection), loginCustomerId: null }),
      this.db.analyticsProperty.findMany({
        where: { organizationId: org.organizationId, connectionId: connection.id },
      }),
    ]);
    const links = new Map(linked.map((p) => [p.propertyId, p]));
    return available.map((p) => ({
      propertyId: p.propertyId,
      name: p.displayName,
      timezone: p.timeZone,
      linked: links.has(p.propertyId),
      adAccountId: links.get(p.propertyId)?.adAccountId ?? null,
    }));
  }

  async selectProperties(
    org: OrgContext,
    connectionId: string,
    links: { propertyId: string; adAccountId: string | null }[],
    ctx: AuditContext,
  ): Promise<AnalyticsPropertyDto[]> {
    const connection = await this.connection(org.organizationId, connectionId);
    if (connection.provider !== 'GOOGLE_ANALYTICS')
      throw new BadRequestException('Not a Google Analytics connection');
    const available = await this.providers
      .analytics(connection)
      .listProperties({ refreshToken: this.refreshToken(connection), loginCustomerId: null });
    const byId = new Map(available.map((p) => [p.propertyId, p]));
    const accountIds = links.map((l) => l.adAccountId).filter((id): id is string => id !== null);
    const accounts = await this.db.adAccount.findMany({
      where: { organizationId: org.organizationId, id: { in: accountIds } },
      select: { id: true },
    });
    if (accounts.length !== new Set(accountIds).size)
      throw new BadRequestException('One or more ad accounts were not found in this organization');

    await this.db.$transaction(async (tx) => {
      await tx.analyticsProperty.deleteMany({
        where: {
          organizationId: org.organizationId,
          connectionId: connection.id,
          propertyId: { notIn: links.map((l) => l.propertyId) },
        },
      });
      for (const link of links) {
        const property = byId.get(link.propertyId);
        if (!property)
          throw new BadRequestException(`Property ${link.propertyId} is not accessible with this connection`);
        await tx.analyticsProperty.upsert({
          where: {
            organizationId_propertyId: { organizationId: org.organizationId, propertyId: link.propertyId },
          },
          update: {
            connectionId: connection.id,
            adAccountId: link.adAccountId,
            name: property.displayName,
            timezone: property.timeZone,
          },
          create: {
            organizationId: org.organizationId,
            connectionId: connection.id,
            propertyId: link.propertyId,
            adAccountId: link.adAccountId,
            name: property.displayName,
            timezone: property.timeZone,
          },
        });
      }
      await recordAudit(tx, ctx, {
        action: 'integration.properties_selected',
        entityType: 'OAuthConnection',
        entityId: connection.id,
        metadata: { links },
      });
    });
    const saved = await this.db.analyticsProperty.findMany({
      where: { organizationId: org.organizationId, connectionId: connection.id },
      orderBy: { name: 'asc' },
    });
    return saved.map((p) => ({
      id: p.id,
      propertyId: p.propertyId,
      name: p.name,
      timezone: p.timezone,
      adAccountId: p.adAccountId,
    }));
  }

  /** Revokes the Google grant (best effort), deletes the stored token and stops syncing the connection's accounts. */
  async disconnect(org: OrgContext, connectionId: string, ctx: AuditContext): Promise<void> {
    const connection = await this.connection(org.organizationId, connectionId);
    const token = this.refreshToken(connection);
    if (token && !connection.isMock) {
      await this.providers
        .oauth()
        .revoke(token)
        .catch((error: unknown) =>
          this.logger.warn(
            { connectionId, err: redactSecrets(error instanceof Error ? error.message : String(error)) },
            'Google token revocation failed',
          ),
        );
    }
    await this.db.$transaction([
      this.db.oAuthConnection.update({
        where: { id: connection.id },
        data: { status: 'REVOKED', encryptedRefreshToken: null, revokedAt: new Date() },
      }),
      this.db.adAccount.updateMany({
        where: { organizationId: org.organizationId, connectionId: connection.id },
        data: { isActive: false },
      }),
    ]);
    await recordAudit(this.db, ctx, {
      action: 'integration.disconnected',
      entityType: 'OAuthConnection',
      entityId: connection.id,
      metadata: { provider: connection.provider },
    });
  }

  async adAccounts(org: OrgContext): Promise<AdAccountDto[]> {
    const accounts = await this.db.adAccount.findMany({
      where: { organizationId: org.organizationId },
      orderBy: [{ isManager: 'asc' }, { name: 'asc' }],
    });
    return accounts.map(toAdAccountDto);
  }

  async setAccountActive(
    org: OrgContext,
    id: string,
    isActive: boolean,
    ctx: AuditContext,
  ): Promise<AdAccountDto> {
    const account = await this.db.adAccount.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!account) throw new NotFoundException('Ad account not found');
    if (account.isManager && isActive)
      throw new BadRequestException('Manager accounts cannot be activated for reporting');
    if (isActive && !account.connectionId)
      throw new BadRequestException('Reconnect Google Ads before activating this account');
    const updated = await this.db.adAccount.update({ where: { id: account.id }, data: { isActive } });
    await recordAudit(this.db, ctx, {
      action: isActive ? 'ad_account.activated' : 'ad_account.deactivated',
      entityType: 'AdAccount',
      entityId: account.id,
    });
    return toAdAccountDto(updated);
  }
}
