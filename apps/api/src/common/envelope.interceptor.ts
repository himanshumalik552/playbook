import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { ApiSuccess, Paginated } from '@adpulse/types';
import { map, type Observable } from 'rxjs';
import type { AppRequest } from './request-context';

function isPaginated(value: unknown): value is Paginated<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Paginated<unknown>).items) &&
    typeof (value as Paginated<unknown>).meta?.total === 'number'
  );
}

/** Wraps handler results in the `{ success, data, meta, requestId }` envelope. Files and streams pass through. */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    return next.handle().pipe(
      map((value: unknown) => {
        if (
          value instanceof StreamableFile ||
          context.switchToHttp().getResponse<{ headersSent: boolean }>().headersSent
        ) {
          return value;
        }
        if (isPaginated(value)) {
          return {
            success: true,
            data: value.items,
            meta: value.meta,
            requestId: req.requestId,
          } satisfies ApiSuccess<unknown>;
        }
        return { success: true, data: value ?? null, requestId: req.requestId } satisfies ApiSuccess<unknown>;
      }),
    );
  }
}
