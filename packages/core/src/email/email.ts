import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from '../logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly kind: 'console' | 'smtp';
  send(message: EmailMessage): Promise<void>;
}

/**
 * Development provider. Outside production the plain-text body (which contains one-time links) is logged
 * so developers can complete flows locally; in production only envelope metadata is logged.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly kind = 'console' as const;
  readonly outbox: EmailMessage[] = [];

  constructor(
    private readonly logger: Logger,
    private readonly revealBody: boolean,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 100) this.outbox.shift();
    this.logger.info(
      {
        email: {
          to: message.to,
          subject: message.subject,
          ...(this.revealBody ? { body: message.text } : {}),
        },
      },
      'Email captured by console provider',
    );
  }
}

export class SmtpEmailProvider implements EmailProvider {
  readonly kind = 'smtp' as const;
  private readonly transporter: Transporter;

  constructor(
    options: { host: string; port: number; secure: boolean; user?: string; password?: string },
    private readonly from: string,
  ) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.user ? { user: options.user, pass: options.password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

export function createEmailProvider(
  env: {
    NODE_ENV: string;
    EMAIL_PROVIDER: 'console' | 'smtp';
    EMAIL_FROM: string;
    SMTP_HOST?: string;
    SMTP_PORT: number;
    SMTP_SECURE: boolean;
    SMTP_USER?: string;
    SMTP_PASSWORD?: string;
  },
  logger: Logger,
): EmailProvider {
  if (env.EMAIL_PROVIDER === 'smtp' && env.SMTP_HOST) {
    return new SmtpEmailProvider(
      {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
      },
      env.EMAIL_FROM,
    );
  }
  return new ConsoleEmailProvider(logger, env.NODE_ENV !== 'production');
}
