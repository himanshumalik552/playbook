import type { DbClient, Prisma } from '@adpulse/database';

export interface AuditContext {
  actorId?: string | null;
  organizationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditEvent {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEYS = /password|token|secret|authorization|cookie/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEYS.test(k) ? '[REDACTED]' : sanitize(v, depth + 1),
      ]),
    );
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

/** Writes append-only audit records. Accepts a transaction client so audits commit atomically with changes. */
export async function recordAudit(db: DbClient, ctx: AuditContext, event: AuditEvent): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: ctx.organizationId ?? null,
      actorId: ctx.actorId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent?.slice(0, 500) ?? null,
      requestId: ctx.requestId ?? null,
      action: event.action,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      metadata: sanitize(event.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T)[],
): { field: string; oldValue: string | null; newValue: string | null }[] {
  const toText = (v: unknown) =>
    v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);
  return fields
    .filter((f) => f in after && toText(before[f]) !== toText(after[f]))
    .map((f) => ({ field: String(f), oldValue: toText(before[f]), newValue: toText(after[f]) }));
}
