import { createHash } from 'node:crypto';
import { ProviderError } from '../errors';
import { generateToken, hashToken } from '../crypto/tokens';
import { requestJson } from './http';
import type { OAuthIdentity, OAuthTokens } from './types';

export const GOOGLE_SCOPES = {
  signIn: ['openid', 'email', 'profile'],
  ads: ['openid', 'email', 'https://www.googleapis.com/auth/adwords'],
  analytics: ['openid', 'email', 'https://www.googleapis.com/auth/analytics.readonly'],
} as const;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  const verifier = generateToken(48);
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

export class GoogleOAuthClient {
  private readonly accessTokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  buildAuthUrl(params: {
    redirectUri: string;
    scopes: readonly string[];
    state: string;
    codeChallenge: string;
    offline: boolean;
  }) {
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scopes.join(' '));
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('include_granted_scopes', 'true');
    if (params.offline) {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
    } else {
      url.searchParams.set('prompt', 'select_account');
    }
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<OAuthTokens> {
    const res = await requestJson<TokenResponse>(
      {
        url: TOKEN_URL,
        form: {
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        },
      },
      { retries: 1 },
    );
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? null,
      expiresIn: res.expires_in,
      scope: res.scope,
      idToken: res.id_token ?? null,
    };
  }

  /** Returns a cached access token, refreshing one minute before expiry. */
  async getAccessToken(refreshToken: string): Promise<string> {
    const key = hashToken(refreshToken);
    const cached = this.accessTokens.get(key);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const res = await requestJson<TokenResponse>({
      url: TOKEN_URL,
      form: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      },
    });
    this.accessTokens.set(key, { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 });
    return res.access_token;
  }

  async revoke(token: string): Promise<void> {
    await requestJson({ url: REVOKE_URL, form: { token } }, { retries: 2 }).catch((error: unknown) => {
      if (error instanceof ProviderError && error.status === 400) return;
      throw error;
    });
    this.accessTokens.delete(hashToken(token));
  }

  /** Validates an ID token with Google (signature, audience, issuer, expiry) and extracts identity. */
  async verifyIdToken(idToken: string): Promise<OAuthIdentity> {
    const info = await requestJson<Record<string, string>>(
      { url: `${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}` },
      { retries: 1 },
    );
    const validIssuer = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
    if (
      info.aud !== this.clientId ||
      !validIssuer ||
      Number(info.exp) * 1000 < Date.now() ||
      !info.sub ||
      !info.email
    ) {
      throw new ProviderError('Invalid Google identity token', 'AUTH', false, 401);
    }
    return {
      subject: info.sub,
      email: info.email.toLowerCase(),
      emailVerified: info.email_verified === 'true',
      name: info.name ?? info.email,
    };
  }
}
