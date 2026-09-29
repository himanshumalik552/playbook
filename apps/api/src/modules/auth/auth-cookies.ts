import type { CookieOptions, Request, Response } from 'express';

export const ACCESS_COOKIE = 'adpulse_at';
export const REFRESH_COOKIE = 'adpulse_rt';
export const CSRF_COOKIE = 'adpulse_csrf';
export const OAUTH_STATE_COOKIE = 'adpulse_oauth';
export const CSRF_HEADER = 'x-csrf-token';

/** The refresh cookie is only sent to the auth endpoints, which limits its exposure. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface CookieSettings {
  secure: boolean;
  domain?: string;
}

function base(settings: CookieSettings): CookieOptions {
  return {
    secure: settings.secure,
    sameSite: 'lax',
    ...(settings.domain ? { domain: settings.domain } : {}),
  };
}

export function setSessionCookies(
  res: Response,
  settings: CookieSettings,
  tokens: {
    accessToken: string;
    refreshToken: string;
    csrfToken: string;
    accessTtlSeconds: number;
    refreshExpiresAt: Date;
  },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(settings),
    httpOnly: true,
    path: '/',
    maxAge: tokens.accessTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(settings),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshExpiresAt,
  });
  setCsrfCookie(res, settings, tokens.csrfToken);
}

/** Readable by the SPA (not HttpOnly) so it can echo the value in the X-CSRF-Token header (double-submit). */
export function setCsrfCookie(res: Response, settings: CookieSettings, token: string): void {
  res.cookie(CSRF_COOKIE, token, { ...base(settings), httpOnly: false, path: '/' });
}

export function clearSessionCookies(res: Response, settings: CookieSettings): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(settings), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(settings), path: REFRESH_COOKIE_PATH });
}

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() || undefined : undefined;
}
