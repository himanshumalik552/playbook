import { ProviderError } from '../errors';
import { redactSecrets } from '../logger';
import { withRetry } from '../retry';

/** Serializes outbound calls to respect provider QPS limits (simple spacing limiter). */
export class RateLimiter {
  private next = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly minIntervalMs: number) {}

  schedule(): Promise<void> {
    const run = this.chain.then(async () => {
      const wait = Math.max(0, this.next - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.next = Date.now() + this.minIntervalMs;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export function classifyHttpError(status: number, bodyText: string, retryAfter?: number): ProviderError {
  const text = redactSecrets(bodyText).slice(0, 1000);
  const quota = /RESOURCE_EXHAUSTED|QUOTA|RATE_LIMIT/i.test(bodyText);
  if (status === 429 || quota)
    return new ProviderError(`Provider quota exceeded: ${text}`, 'QUOTA', true, status, retryAfter);
  if (status === 401 || /invalid_grant|UNAUTHENTICATED/i.test(bodyText)) {
    return new ProviderError(`Provider authorization failed: ${text}`, 'AUTH', false, status);
  }
  if (status === 403)
    return new ProviderError(`Provider permission denied: ${text}`, 'PERMISSION', false, status);
  if (status >= 500)
    return new ProviderError(`Provider unavailable (${status})`, 'UNAVAILABLE', true, status, retryAfter);
  return new ProviderError(`Provider request failed (${status}): ${text}`, 'BAD_REQUEST', false, status);
}

export interface JsonRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  form?: Record<string, string>;
  timeoutMs?: number;
}

export async function requestJson<T>(
  request: JsonRequest,
  options: { limiter?: RateLimiter; retries?: number } = {},
): Promise<T> {
  return withRetry(
    async () => {
      await options.limiter?.schedule();
      const headers: Record<string, string> = { Accept: 'application/json', ...request.headers };
      let body: string | undefined;
      if (request.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(request.form).toString();
      } else if (request.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(request.body);
      }
      let response: Response;
      try {
        response = await fetch(request.url, {
          method: request.method ?? (body ? 'POST' : 'GET'),
          headers,
          body,
          signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
        });
      } catch (error) {
        throw new ProviderError(
          `Network error contacting provider: ${redactSecrets((error as Error).message)}`,
          'NETWORK',
          true,
        );
      }
      const text = await response.text();
      if (!response.ok) throw classifyHttpError(response.status, text, retryAfterMs(response));
      return (text ? JSON.parse(text) : {}) as T;
    },
    { retries: options.retries ?? 4, baseDelayMs: 1000, maxDelayMs: 60_000 },
  );
}
