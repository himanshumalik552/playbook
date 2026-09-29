import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL-safe random token with 256 bits of entropy by default. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * SHA-256 digest used for high-entropy tokens (refresh, reset, invitation). A slow KDF is unnecessary
 * because the inputs are random 256-bit values, and a fast hash allows indexed lookups.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hmacSign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Signs a payload as `<base64url json>.<hmac>` for short-lived state such as OAuth `state`. */
export function signPayload(payload: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${hmacSign(body, secret)}`;
}

export function verifySignedPayload<T extends Record<string, unknown>>(
  token: string,
  secret: string,
): T | null {
  const [body, signature] = token.split('.');
  if (!body || !signature || !safeEqual(signature, hmacSign(body, secret))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
