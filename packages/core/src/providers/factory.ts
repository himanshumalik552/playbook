import type { AppEnv } from '@adpulse/config';
import { DomainError } from '../errors';
import { GoogleAdsProvider } from './google-ads.provider';
import { GoogleAnalyticsProvider } from './google-analytics.provider';
import { GoogleOAuthClient } from './google-oauth';
import { MockAdsProvider } from './mock-ads.provider';
import { MockAnalyticsProvider } from './mock-analytics.provider';
import type { AdsProvider, AnalyticsProvider } from './types';

export type ProviderEnv = Pick<
  AppEnv,
  | 'INTEGRATION_MODE'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'GOOGLE_ADS_DEVELOPER_TOKEN'
  | 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'
  | 'GOOGLE_ADS_API_VERSION'
>;

/** Selects mock or Google implementations. Mock connections always use mock providers, even in google mode. */
export class ProviderFactory {
  private readonly mockAds = new MockAdsProvider();
  private readonly mockAnalytics = new MockAnalyticsProvider();
  private readonly oauthClient: GoogleOAuthClient | null;
  private googleAds: GoogleAdsProvider | null = null;
  private googleAnalytics: GoogleAnalyticsProvider | null = null;

  constructor(private readonly env: ProviderEnv) {
    this.oauthClient =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? new GoogleOAuthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
        : null;
  }

  get googleConfigured(): boolean {
    return this.oauthClient !== null;
  }

  get googleAdsConfigured(): boolean {
    return this.oauthClient !== null && Boolean(this.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  }

  oauth(): GoogleOAuthClient {
    if (!this.oauthClient) {
      throw new DomainError(
        'INTEGRATION_UNAVAILABLE',
        'Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET)',
      );
    }
    return this.oauthClient;
  }

  ads(connection: { isMock: boolean }): AdsProvider {
    if (connection.isMock) return this.mockAds;
    if (this.env.INTEGRATION_MODE !== 'google' || !this.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      throw new DomainError('INTEGRATION_UNAVAILABLE', 'Live Google Ads integration is not enabled');
    }
    this.googleAds ??= new GoogleAdsProvider(
      this.oauth(),
      this.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      this.env.GOOGLE_ADS_API_VERSION,
      this.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    );
    return this.googleAds;
  }

  analytics(connection: { isMock: boolean }): AnalyticsProvider {
    if (connection.isMock) return this.mockAnalytics;
    if (this.env.INTEGRATION_MODE !== 'google') {
      throw new DomainError('INTEGRATION_UNAVAILABLE', 'Live Google Analytics integration is not enabled');
    }
    this.googleAnalytics ??= new GoogleAnalyticsProvider(this.oauth());
    return this.googleAnalytics;
  }
}
