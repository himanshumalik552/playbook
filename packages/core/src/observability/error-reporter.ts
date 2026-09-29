import { randomUUID } from 'node:crypto';
import { redactSecrets } from '../logger';

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  route?: string;
}

export interface ErrorReporter {
  capture(error: unknown, context?: ErrorContext): void;
}

interface ParsedDsn {
  storeUrl: string;
  publicKey: string;
}

/** Parses a Sentry-style DSN: https://<publicKey>@<host>/<projectId>. */
export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return null;
    return { storeUrl: `${url.protocol}//${url.host}/api/${projectId}/store/`, publicKey: url.username };
  } catch {
    return null;
  }
}

/**
 * Minimal client for the Sentry store API (also accepted by GlitchTip and other Sentry-compatible backends).
 * Delivery is fire-and-forget so reporting never affects request latency; messages are redacted first.
 */
export class HttpErrorReporter implements ErrorReporter {
  constructor(
    private readonly dsn: ParsedDsn,
    private readonly environment: string,
    private readonly release: string,
    private readonly service: string,
  ) {}

  capture(error: unknown, context: ErrorContext = {}): void {
    const err = error instanceof Error ? error : new Error(String(error));
    const body = {
      event_id: randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'node',
      level: 'error',
      environment: this.environment,
      release: this.release,
      server_name: this.service,
      tags: {
        requestId: context.requestId ?? null,
        route: context.route ?? null,
        organizationId: context.organizationId ?? null,
      },
      user: context.userId ? { id: context.userId } : undefined,
      exception: {
        values: [
          {
            type: err.name,
            value: redactSecrets(err.message),
            stacktrace: { frames: stackFrames(err.stack) },
          },
        ],
      },
    };
    void fetch(this.dsn.storeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_client=adpulse/1.0, sentry_key=${this.dsn.publicKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  }
}

function stackFrames(stack: string | undefined): { function: string; filename: string }[] {
  return (stack ?? '')
    .split('\n')
    .slice(1, 30)
    .map((line) => line.trim().replace(/^at /, ''))
    .map((line) => {
      const match = /^(.*?) \((.*)\)$/.exec(line);
      return { function: match?.[1] ?? '<anonymous>', filename: match?.[2] ?? line };
    })
    .reverse();
}

export const noopErrorReporter: ErrorReporter = { capture: () => undefined };

export function createErrorReporter(options: {
  dsn?: string;
  environment: string;
  release: string;
  service: string;
}): ErrorReporter {
  const parsed = options.dsn ? parseDsn(options.dsn) : null;
  return parsed
    ? new HttpErrorReporter(parsed, options.environment, options.release, options.service)
    : noopErrorReporter;
}
