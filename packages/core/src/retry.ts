import { ProviderError } from './errors';

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ProviderError) return error.retryable;
  if (error instanceof Error) {
    return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i.test(error.message);
  }
  return false;
}

/** Exponential backoff with full jitter; honours provider `Retry-After` hints. */
export function backoffDelay(
  attempt: number,
  options: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'random'>,
) {
  const exp = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** attempt);
  return Math.round(exp / 2 + (options.random ?? Math.random)() * (exp / 2));
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= options.retries || !isRetryableError(error)) throw error;
      const hinted = error instanceof ProviderError ? error.retryAfterMs : undefined;
      const delay = Math.min(options.maxDelayMs, hinted ?? backoffDelay(attempt, options));
      options.onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
      attempt += 1;
    }
  }
}
