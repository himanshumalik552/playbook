import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  DomainError,
  type DomainErrorCode,
  type ErrorReporter,
  type Logger,
  redactSecrets,
} from '@adpulse/core';
import { isNotFound, isUniqueViolation } from '@adpulse/database';
import type { ApiErrorBody } from '@adpulse/types';
import type { Response } from 'express';
import { ERROR_REPORTER, LOGGER } from '../infra/tokens';
import type { AppRequest } from './request-context';

const DOMAIN_STATUS: Record<DomainErrorCode, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  CONFLICT: HttpStatus.CONFLICT,
  INVALID_STATE: HttpStatus.CONFLICT,
  INTEGRATION_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTEGRATION_AUTH: HttpStatus.BAD_GATEWAY,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
};

const HTTP_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_FAILED',
  423: 'LOCKED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

export interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export function mapError(exception: unknown): MappedError {
  if (exception instanceof ThrottlerException) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down and try again shortly.',
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const payload = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const rawMessage = payload.message ?? exception.message;
    const isValidation = Array.isArray(rawMessage);
    return {
      status,
      code:
        typeof payload.code === 'string'
          ? payload.code
          : isValidation
            ? 'VALIDATION_FAILED'
            : (HTTP_CODES[status] ?? 'ERROR'),
      message: isValidation ? 'Request validation failed' : String(rawMessage),
      details: isValidation ? rawMessage : payload.details,
    };
  }
  if (exception instanceof DomainError) {
    return {
      status: DOMAIN_STATUS[exception.code],
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }
  if (isUniqueViolation(exception))
    return { status: 409, code: 'CONFLICT', message: 'A record with these values already exists' };
  if (isNotFound(exception)) return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' };
  return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AppRequest>();
    const res = ctx.getResponse<Response>();
    const mapped = mapError(exception);

    if (mapped.status >= 500) {
      const message = redactSecrets(exception instanceof Error ? exception.message : String(exception));
      this.logger.error(
        {
          requestId: req.requestId,
          path: req.path,
          err: { message, stack: exception instanceof Error ? exception.stack : undefined },
        },
        'Unhandled error',
      );
      this.reporter.capture(exception, {
        requestId: req.requestId,
        userId: req.user?.id,
        organizationId: req.org?.organizationId,
        route: `${req.method} ${req.route?.path ?? req.path}`,
      });
    }
    if (res.headersSent) return;

    const body: ApiErrorBody = {
      success: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details === undefined ? {} : { details: mapped.details }),
      },
      requestId: req.requestId,
    };
    res.status(mapped.status).json(body);
  }
}
