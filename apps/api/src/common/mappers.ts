import { fromDbDate, type Prisma } from '@adpulse/database';
import type { UserRef } from '@adpulse/types';

export const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);
export const isoDate = (value: Date | null | undefined): string | null => (value ? fromDbDate(value) : null);

/** Decimal → number at the API boundary; all arithmetic happens before this point. */
export const num = (value: Prisma.Decimal | number | bigint | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

export const userRef = (user: { id: string; name: string } | null | undefined): UserRef | null =>
  user ? { id: user.id, name: user.name } : null;
