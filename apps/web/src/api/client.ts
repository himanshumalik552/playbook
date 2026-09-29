import type { ApiErrorBody, ApiSuccess, PaginationMeta } from '@adpulse/types';
import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

const CSRF_COOKIE = 'adpulse_csrf';
const SAFE_METHODS = new Set(['get', 'head', 'options']);
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/register', '/auth/csrf'];

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

export interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
  skipOrg?: boolean;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Omit the X-Organization-Id header (auth, profile and cross-organization endpoints). */
    skipOrg?: boolean;
  }
}

let activeOrganizationId: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

/** The organization id is not a credential; the API validates membership on every request. */
export function setActiveOrganizationId(id: string | null) {
  activeOrganizationId = id;
}

export function onSessionExpired(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

export function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export const http = axios.create({ baseURL: '/api/v1', withCredentials: true, timeout: 60_000 });

let csrfPromise: Promise<void> | null = null;

async function ensureCsrf(): Promise<string | null> {
  if (!readCookie(CSRF_COOKIE)) {
    csrfPromise ??= axios
      .get('/api/v1/auth/csrf', { withCredentials: true })
      .then(() => undefined)
      .finally(() => {
        csrfPromise = null;
      });
    await csrfPromise;
  }
  return readCookie(CSRF_COOKIE);
}

http.interceptors.request.use(async (config) => {
  const cfg = config as RetriableConfig;
  if (activeOrganizationId && !cfg.skipOrg) cfg.headers.set('X-Organization-Id', activeOrganizationId);
  if (!SAFE_METHODS.has((cfg.method ?? 'get').toLowerCase())) {
    const token = await ensureCsrf();
    if (token) cfg.headers.set('X-CSRF-Token', token);
  }
  return cfg;
});

let refreshPromise: Promise<boolean> | null = null;

/** Concurrent 401s share one refresh call so the rotating refresh token is used exactly once. */
function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const token = await ensureCsrf();
      await axios.post('/api/v1/auth/refresh', null, {
        withCredentials: true,
        headers: token ? { 'X-CSRF-Token': token } : {},
      });
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function toApiError(error: AxiosError<ApiErrorBody>): ApiError {
  const status = error.response?.status ?? 0;
  const body = error.response?.data;
  if (body && typeof body === 'object' && 'error' in body && body.error) {
    const { code, message, details } = body.error;
    const messages =
      Array.isArray(details) && details.every((d) => typeof d === 'string') ? (details as string[]) : [];
    return new ApiError(
      messages.length > 0 ? `${message}: ${messages.join('; ')}` : message,
      status,
      code,
      details,
      body.requestId,
    );
  }
  if (status === 0)
    return new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR');
  return new ApiError(error.message || 'Unexpected error', status, 'UNKNOWN');
}

http.interceptors.response.use(undefined, async (error: AxiosError<ApiErrorBody>) => {
  const config = error.config as RetriableConfig | undefined;
  const path = config?.url ?? '';
  if (
    error.response?.status === 401 &&
    config &&
    !config._retried &&
    !NO_REFRESH_PATHS.some((p) => path.startsWith(p))
  ) {
    config._retried = true;
    if (await refreshSession()) return http.request(config);
    sessionExpiredHandler?.();
  }
  if (error.response?.data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await error.response.data.text()) as ApiErrorBody;
    } catch {
      /* Non-JSON error body; fall through with the HTTP status only. */
    }
  }
  throw toApiError(error);
});

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await http.request<ApiSuccess<T>>(config);
  return res.status === 204 ? (undefined as T) : res.data.data;
}

export async function requestPage<T>(config: AxiosRequestConfig): Promise<Page<T>> {
  const res = await http.request<ApiSuccess<T[]>>(config);
  const items = res.data.data;
  return {
    items,
    meta: res.data.meta ?? { page: 1, pageSize: items.length, total: items.length, totalPages: 1 },
  };
}

export const api = {
  get: <T>(url: string, params?: object, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'GET', url, params }),
  page: <T>(url: string, params?: object) => requestPage<T>({ method: 'GET', url, params }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  put: <T>(url: string, data?: unknown) => request<T>({ method: 'PUT', url, data }),
  patch: <T>(url: string, data?: unknown) => request<T>({ method: 'PATCH', url, data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) => request<T>({ ...config, method: 'DELETE', url }),
};

/** Downloads an attachment response (CSV, PDF, Excel) through the authenticated client. */
export async function downloadFile(url: string, params?: object, fallbackName = 'download'): Promise<void> {
  const res = await http.get<Blob>(url, { params, responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

/** Comma-joins array params the way the API's `toArray` transforms expect, and drops empty values. */
export function toParams(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) out[key] = value.join(',');
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
