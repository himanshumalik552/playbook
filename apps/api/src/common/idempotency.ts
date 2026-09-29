import { BadRequestException } from '@nestjs/common';
import type { AppRequest } from './request-context';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const VALID_KEY = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Reads the optional Idempotency-Key header and scopes it to the caller, so two users can never collide
 * on (or replay) each other's keys.
 */
export function idempotencyKey(req: AppRequest, scope: string): string | null {
  const raw = req.get(IDEMPOTENCY_HEADER);
  if (raw === undefined || raw === '') return null;
  if (!VALID_KEY.test(raw))
    throw new BadRequestException('Idempotency-Key must be 8–100 characters of [A-Za-z0-9_-]');
  return `${scope}_${req.user?.id ?? 'anon'}_${raw}`;
}
