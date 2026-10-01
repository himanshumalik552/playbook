import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../src';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('parseEnv', () => {
  it('applies safe defaults', () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.INTEGRATION_MODE).toBe('mock');
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.STORAGE_PROVIDER).toBe('local');
  });

  it('rejects short secrets and malformed encryption keys', () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(EnvValidationError);
    expect(() => parseEnv({ ...base, ENCRYPTION_KEY: 'not-base64' })).toThrow(/ENCRYPTION_KEY/);
  });

  it('rejects redis-cli command strings as REDIS_URL', () => {
    expect(() =>
      parseEnv({
        ...base,
        REDIS_URL: 'redis://redis-cli --tls -u redis://default:token@host:6379',
      }),
    ).toThrow(/REDIS_URL/);
    expect(parseEnv({ ...base, REDIS_URL: 'rediss://default:token@host:6379' }).REDIS_URL).toBe(
      'rediss://default:token@host:6379',
    );
  });

  it('requires Google credentials in google mode', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', INTEGRATION_MODE: 'google' })).toThrow(
      /GOOGLE_ADS_DEVELOPER_TOKEN/,
    );
  });

  it('rejects placeholder secrets in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-change-me-change-me-change-me',
      }),
    ).toThrow(/placeholder/);
    const devKey = Buffer.from('dev-only-encryption-key-32bytes!').toString('base64');
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', ENCRYPTION_KEY: devKey })).toThrow(
      /development placeholder/,
    );
    expect(parseEnv({ ...base, ENCRYPTION_KEY: devKey }).ENCRYPTION_KEY).toBe(devKey);
  });

  it('requires distinct JWT secrets in production', () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET }),
    ).toThrow(/must differ/);
  });

  it('requires storage and smtp settings when enabled', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', STORAGE_PROVIDER: 'azure' })).toThrow(
      /AZURE_STORAGE_CONNECTION_STRING/,
    );
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', EMAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_HOST/);
  });

  it('parses booleans and blanks', () => {
    const env = parseEnv({ ...base, SWAGGER_ENABLED: 'true', SENTRY_DSN: '  ' });
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.SENTRY_DSN).toBeUndefined();
  });
});
