import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { idempotencyKey } from '../../src/common/idempotency';
import type { AppRequest } from '../../src/common/request-context';
import {
  ACCESS_COOKIE,
  bearerToken,
  clearSessionCookies,
  CSRF_COOKIE,
  readCookie,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  setSessionCookies,
} from '../../src/modules/auth/auth-cookies';
import { createOAuthState, safeNextPath, verifyOAuthState } from '../../src/modules/auth/oauth-state';

function fakeResponse() {
  const cookies: Record<string, { value: string; options: Record<string, unknown> }> = {};
  const cleared: Record<string, Record<string, unknown>> = {};
  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      cookies[name] = { value, options };
    },
    clearCookie: (name: string, options: Record<string, unknown>) => {
      cleared[name] = options;
    },
  } as unknown as Response;
  return { res, cookies, cleared };
}

function fakeRequest(headers: Record<string, string>, extra: Partial<AppRequest> = {}): AppRequest {
  return { get: (name: string) => headers[name.toLowerCase()], ...extra } as unknown as AppRequest;
}

describe('session cookies', () => {
  it('keeps tokens out of script reach and scopes the refresh token to the auth routes', () => {
    const { res, cookies } = fakeResponse();
    const refreshExpiresAt = new Date('2026-10-28T00:00:00.000Z');
    setSessionCookies(
      res,
      { secure: true, domain: 'example.com' },
      { accessToken: 'at', refreshToken: 'rt', csrfToken: 'csrf', accessTtlSeconds: 900, refreshExpiresAt },
    );

    expect(cookies[ACCESS_COOKIE]?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 900_000,
      domain: 'example.com',
    });
    expect(cookies[REFRESH_COOKIE]?.options).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: refreshExpiresAt,
    });
    expect(cookies[CSRF_COOKIE]?.options).toMatchObject({ httpOnly: false, path: '/' });
  });

  it('clears both session cookies on their original paths', () => {
    const { res, cleared } = fakeResponse();
    clearSessionCookies(res, { secure: false });
    expect(cleared[ACCESS_COOKIE]).toMatchObject({ path: '/' });
    expect(cleared[REFRESH_COOKIE]).toMatchObject({ path: REFRESH_COOKIE_PATH });
  });

  it('reads only non-empty string cookies and bearer tokens', () => {
    const req = { cookies: { a: 'x', b: '', c: 3 } } as unknown as Request;
    expect(readCookie(req, 'a')).toBe('x');
    expect(readCookie(req, 'b')).toBeUndefined();
    expect(readCookie(req, 'c')).toBeUndefined();
    expect(readCookie({} as Request, 'a')).toBeUndefined();

    expect(bearerToken(fakeRequest({ authorization: 'Bearer abc ' }))).toBe('abc');
    expect(bearerToken(fakeRequest({ authorization: 'Basic abc' }))).toBeUndefined();
    expect(bearerToken(fakeRequest({ authorization: 'Bearer ' }))).toBeUndefined();
  });
});

describe('idempotencyKey', () => {
  it('scopes keys to the caller', () => {
    const req = fakeRequest(
      { 'idempotency-key': 'abc12345' },
      { user: { id: 'user1' } as AppRequest['user'] },
    );
    expect(idempotencyKey(req, 'report')).toBe('report_user1_abc12345');
  });

  it('returns null without a header and rejects malformed keys', () => {
    expect(idempotencyKey(fakeRequest({}), 'report')).toBeNull();
    expect(() => idempotencyKey(fakeRequest({ 'idempotency-key': 'short' }), 'report')).toThrow(
      BadRequestException,
    );
    expect(() => idempotencyKey(fakeRequest({ 'idempotency-key': 'has spaces in it' }), 'report')).toThrow(
      BadRequestException,
    );
  });
});

describe('OAuth state', () => {
  const secret = 'x'.repeat(48);
  const now = Date.UTC(2026, 8, 28, 10);

  it('round-trips the context when state and cookie match', () => {
    const { state, cookie, codeChallenge } = createOAuthState(
      secret,
      { purpose: 'ads', userId: 'u1', organizationId: 'o1' },
      now,
    );
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const payload = verifyOAuthState(secret, state, cookie, 'ads', now + 1000);
    expect(payload).toMatchObject({ purpose: 'ads', userId: 'u1', organizationId: 'o1' });
    expect(payload?.verifier).toBeTruthy();
  });

  it('rejects a wrong purpose, nonce, secret, missing cookie or expired state', () => {
    const { state, cookie } = createOAuthState(secret, { purpose: 'ads' }, now);
    expect(verifyOAuthState(secret, state, cookie, 'analytics', now)).toBeNull();
    expect(verifyOAuthState(secret, 'other-nonce', cookie, 'ads', now)).toBeNull();
    expect(verifyOAuthState('y'.repeat(48), state, cookie, 'ads', now)).toBeNull();
    expect(verifyOAuthState(secret, state, undefined, 'ads', now)).toBeNull();
    expect(verifyOAuthState(secret, state, cookie, 'ads', now + 11 * 60_000)).toBeNull();
  });

  it('only accepts same-origin relative redirect targets', () => {
    expect(safeNextPath('/campaigns?x=1')).toBe('/campaigns?x=1');
    expect(safeNextPath('//evil.example')).toBeUndefined();
    expect(safeNextPath('https://evil.example')).toBeUndefined();
    expect(safeNextPath('/\\evil')).toBeUndefined();
    expect(safeNextPath(`/${'a'.repeat(400)}`)).toBeUndefined();
    expect(safeNextPath(42)).toBeUndefined();
  });
});
