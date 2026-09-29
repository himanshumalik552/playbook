import pino, { type Logger, type LoggerOptions } from 'pino';

export const REDACT_PATHS = [
  'password',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.encryptedRefreshToken',
  '*.clientSecret',
  '*.secret',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
];

const SECRET_PATTERNS: [RegExp, string][] = [
  [/ya29\.[\w.-]+/g, 'ya29.[REDACTED]'],
  [/1\/\/[\w.-]{20,}/g, '1//[REDACTED]'],
  [/Bearer\s+[\w.~+/-]+=*/gi, 'Bearer [REDACTED]'],
  [/(refresh_token|access_token|client_secret|developer-token|code)=([^&\s"]+)/gi, '$1=[REDACTED]'],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[REDACTED_JWT]'],
];

/** Strips credential-looking substrings from free text (provider errors, exception messages). */
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

export function createLogger(options: { level?: string; name?: string } = {}): Logger {
  const config: LoggerOptions = {
    name: options.name ?? 'adpulse',
    level: options.level ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: options.name ?? 'adpulse' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  };
  return pino(config);
}

export type { Logger };
