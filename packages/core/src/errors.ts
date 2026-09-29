export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'INTEGRATION_UNAVAILABLE'
  | 'INTEGRATION_AUTH'
  | 'RATE_LIMITED';

/** Framework-agnostic business error; the API maps these to HTTP responses. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const notFound = (entity: string) => new DomainError('NOT_FOUND', `${entity} not found`);
export const invalidState = (message: string, details?: unknown) =>
  new DomainError('INVALID_STATE', message, details);
export const conflict = (message: string) => new DomainError('CONFLICT', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new DomainError('FORBIDDEN', message);

/** Error raised by integration providers; `retryable` drives BullMQ retry behaviour. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  get isAuthError(): boolean {
    return this.code === 'AUTH' || this.status === 401;
  }
}
