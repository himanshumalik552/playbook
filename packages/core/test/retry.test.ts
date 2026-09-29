import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../src/errors';
import { backoffDelay, isRetryableError, withRetry } from '../src/retry';

const noSleep = () => Promise.resolve();

describe('isRetryableError', () => {
  it('classifies provider and network errors', () => {
    expect(isRetryableError(new ProviderError('quota', 'RATE_LIMITED', true, 429))).toBe(true);
    expect(isRetryableError(new ProviderError('denied', 'AUTH', false, 401))).toBe(false);
    expect(isRetryableError(new Error('read ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('bad input'))).toBe(false);
    expect(isRetryableError('string')).toBe(false);
  });
});

describe('ProviderError', () => {
  it('detects auth errors', () => {
    expect(new ProviderError('x', 'AUTH', false).isAuthError).toBe(true);
    expect(new ProviderError('x', 'HTTP', false, 401).isAuthError).toBe(true);
    expect(new ProviderError('x', 'HTTP', true, 500).isAuthError).toBe(false);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially with jitter and caps at the maximum', () => {
    expect(backoffDelay(0, { baseDelayMs: 100, maxDelayMs: 10_000, random: () => 0 })).toBe(50);
    expect(backoffDelay(3, { baseDelayMs: 100, maxDelayMs: 10_000, random: () => 1 })).toBe(800);
    expect(backoffDelay(20, { baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 })).toBe(1000);
  });
});

describe('withRetry', () => {
  it('retries retryable failures and then succeeds', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const result = await withRetry(
      () => {
        calls += 1;
        return calls < 3 ? Promise.reject(new Error('ETIMEDOUT')) : Promise.resolve('ok');
      },
      { retries: 5, baseDelayMs: 10, maxDelayMs: 100, sleep: noSleep, onRetry, random: () => 0.5 },
    );
    expect(result).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('honours Retry-After hints', async () => {
    const sleep = vi.fn(noSleep);
    let calls = 0;
    await withRetry(
      () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new ProviderError('quota', 'RATE_LIMITED', true, 429, 250))
          : Promise.resolve(1);
      },
      { retries: 2, baseDelayMs: 10, maxDelayMs: 1000, sleep },
    );
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn(() => Promise.reject(new ProviderError('denied', 'AUTH', false, 401)));
    await expect(
      withRetry(fn, { retries: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep }),
    ).rejects.toThrow('denied');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('socket hang up')));
    await expect(
      withRetry(fn, { retries: 2, baseDelayMs: 1, maxDelayMs: 1, sleep: noSleep }),
    ).rejects.toThrow('socket hang up');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
