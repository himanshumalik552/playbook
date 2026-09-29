import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { AppEnv } from '@adpulse/config';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { GlobalExceptionFilter } from './common/exception.filter';
import { CsrfGuard, JwtAuthGuard, OrgContextGuard, PermissionsGuard } from './common/guards';
import { InfraModule } from './infra/infra.module';
import { RedisThrottlerStorage } from './infra/redis-throttler.storage';
import { APP_ENV } from './infra/tokens';
import { ActionsModule } from './modules/actions/actions.module';
import { AdminModule } from './modules/admin/admin.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { TargetsModule } from './modules/targets/targets.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    InfraModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_ENV, RedisThrottlerStorage],
      useFactory: (env: AppEnv, storage: RedisThrottlerStorage) => ({
        throttlers: [{ name: 'default', ttl: env.RATE_LIMIT_TTL_SECONDS * 1000, limit: env.RATE_LIMIT_MAX }],
        storage,
      }),
    }),
    AnalyticsModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    DashboardModule,
    CampaignsModule,
    PerformanceModule,
    TargetsModule,
    AlertsModule,
    ActionsModule,
    RecommendationsModule,
    ReportsModule,
    SyncModule,
    IntegrationsModule,
    AuditLogsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limit → authenticate → CSRF → resolve organization membership → check permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: OrgContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
