import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiError,
  errorMessage,
  http,
  onSessionExpired,
  setActiveOrganizationId,
  toParams,
} from './client';

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown };

function respond(handler: Handler): AxiosAdapter {
  return (config) => {
    const { status, data } = handler(config);
    const response = { data, status, statusText: String(status), headers: {}, config };
    if (status >= 400) {
      return Promise.reject(
        new axios.AxiosError(
          `Request failed with status code ${status}`,
          'ERR_BAD_RESPONSE',
          config,
          undefined,
          response,
        ),
      );
    }
    return Promise.resolve(response);
  };
}

const ok = (data: unknown, meta?: unknown) => ({
  status: 200,
  data: { success: true, data, meta, requestId: 'req-1' },
});

describe('api client', () => {
  const originalHttpAdapter = http.defaults.adapter;
  const originalAxiosAdapter = axios.defaults.adapter;

  beforeEach(() => {
    document.cookie = 'adpulse_csrf=csrf-token; path=/';
    setActiveOrganizationId('org_1');
  });

  afterEach(() => {
    http.defaults.adapter = originalHttpAdapter;
    axios.defaults.adapter = originalAxiosAdapter;
    document.cookie = 'adpulse_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    setActiveOrganizationId(null);
    onSessionExpired(null);
  });

  it('unwraps the success envelope and sends the organization header', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    http.defaults.adapter = respond((config) => {
      seen.push(config);
      return ok({ id: 'c1' });
    });
    await expect(api.get('/campaigns/c1')).resolves.toEqual({ id: 'c1' });
    expect(seen[0]?.headers.get('X-Organization-Id')).toBe('org_1');
    expect(seen[0]?.headers.get('X-CSRF-Token')).toBeUndefined();
  });

  it('adds the CSRF token to state-changing requests and can skip the organization header', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    http.defaults.adapter = respond((config) => {
      seen.push(config);
      return ok({ ok: true });
    });
    await api.post('/auth/logout', undefined, { skipOrg: true });
    expect(seen[0]?.headers.get('X-CSRF-Token')).toBe('csrf-token');
    expect(seen[0]?.headers.get('X-Organization-Id')).toBeUndefined();
  });

  it('returns paginated items with their meta', async () => {
    const meta = { page: 2, pageSize: 10, total: 25, totalPages: 3 };
    http.defaults.adapter = respond(() => ok([{ id: 'a' }], meta));
    await expect(api.page('/alerts', { page: 2 })).resolves.toEqual({ items: [{ id: 'a' }], meta });
  });

  it('maps error envelopes to ApiError including validation details', async () => {
    http.defaults.adapter = respond(() => ({
      status: 400,
      data: {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          details: ['name must be longer than 2 characters'],
        },
        requestId: 'req-9',
      },
    }));
    const error = await api.patch('/organizations/current', { name: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      requestId: 'req-9',
      message: 'Validation failed: name must be longer than 2 characters',
    });
  });

  it('flags forbidden and not-found responses', async () => {
    http.defaults.adapter = respond(() => ({
      status: 403,
      data: { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
    }));
    const error = (await api.get('/admin/health').catch((e: unknown) => e)) as ApiError;
    expect(error.isForbidden).toBe(true);
    expect(error.isNotFound).toBe(false);
  });

  it('refreshes once on 401 and retries the original request', async () => {
    let calls = 0;
    http.defaults.adapter = respond(() =>
      ++calls === 1
        ? { status: 401, data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' } } }
        : ok({ id: 'me' }),
    );
    const refresh = vi.fn(() => ({ status: 200, data: { success: true, data: { refreshed: true } } }));
    axios.defaults.adapter = respond(refresh);
    await expect(api.get('/users/me')).resolves.toEqual({ id: 'me' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });

  it('reports an expired session when the refresh fails', async () => {
    http.defaults.adapter = respond(() => ({
      status: 401,
      data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' } },
    }));
    axios.defaults.adapter = respond(() => ({
      status: 401,
      data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } },
    }));
    const expired = vi.fn();
    onSessionExpired(expired);
    await expect(api.get('/dashboard/overview')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('describes network failures', async () => {
    http.defaults.adapter = (config) =>
      Promise.reject(new axios.AxiosError('Network Error', 'ERR_NETWORK', config));
    await expect(api.get('/dashboard/overview')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});

describe('toParams', () => {
  it('drops empty values and comma-joins arrays', () => {
    expect(toParams({ a: 'x', b: '', c: null, d: undefined, e: ['1', '2'], f: [], g: 0, h: false })).toEqual({
      a: 'x',
      e: '1,2',
      g: 0,
      h: false,
    });
  });
});

describe('errorMessage', () => {
  it('prefers error messages and falls back to a generic one', () => {
    expect(errorMessage(new ApiError('Nope', 400, 'BAD'))).toBe('Nope');
    expect(errorMessage(new Error('Boom'))).toBe('Boom');
    expect(errorMessage('weird')).toBe('Something went wrong');
  });
});
