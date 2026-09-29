import { createPkcePair, generateToken, safeEqual, signPayload, verifySignedPayload } from '@adpulse/core';

export type OAuthPurpose = 'signin' | 'ads' | 'analytics';

export interface OAuthStateContext {
  purpose: OAuthPurpose;
  userId?: string;
  organizationId?: string;
  next?: string;
}

export interface OAuthStatePayload extends OAuthStateContext, Record<string, unknown> {
  nonce: string;
  verifier: string;
  exp: number;
}

const TTL_MS = 10 * 60_000;

/**
 * CSRF-safe OAuth state: a random nonce goes to Google as `state`, while the nonce, PKCE verifier and
 * context are kept in a signed HttpOnly cookie. The callback succeeds only if both match.
 */
export function createOAuthState(
  secret: string,
  context: OAuthStateContext,
  now = Date.now(),
): { state: string; cookie: string; codeChallenge: string } {
  const pkce = createPkcePair();
  const nonce = generateToken(24);
  const payload: OAuthStatePayload = { ...context, nonce, verifier: pkce.verifier, exp: now + TTL_MS };
  return { state: nonce, cookie: signPayload(payload, secret), codeChallenge: pkce.challenge };
}

export function verifyOAuthState(
  secret: string,
  state: string | undefined,
  cookie: string | undefined,
  purpose: OAuthPurpose,
  now = Date.now(),
): OAuthStatePayload | null {
  if (!state || !cookie) return null;
  const payload = verifySignedPayload<OAuthStatePayload>(cookie, secret);
  if (!payload || payload.purpose !== purpose || payload.exp < now || !safeEqual(payload.nonce, state))
    return null;
  return payload;
}

/** Only same-origin relative paths are accepted as post-login destinations (prevents open redirects). */
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return undefined;
  return value.length <= 300 ? value : undefined;
}
