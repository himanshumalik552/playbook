import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption';
import {
  generateToken,
  hashToken,
  hmacSign,
  safeEqual,
  signPayload,
  verifySignedPayload,
} from '../src/crypto/tokens';

const key = randomBytes(32).toString('base64');

describe('EncryptionService', () => {
  const service = new EncryptionService(key);

  it('round-trips with associated data and never exposes plain text', () => {
    const cipher = service.encrypt('1//refresh-token', 'conn-1');
    expect(cipher.startsWith('v1:')).toBe(true);
    expect(cipher).not.toContain('refresh-token');
    expect(service.decrypt(cipher, 'conn-1')).toBe('1//refresh-token');
  });

  it('uses a random IV per encryption', () => {
    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('rejects mismatched associated data, tampering and wrong keys', () => {
    const cipher = service.encrypt('secret', 'conn-1');
    expect(() => service.decrypt(cipher, 'conn-2')).toThrow();
    const parts = cipher.split(':');
    const data = Buffer.from(parts[3] ?? '', 'base64');
    data[0] = (data[0] ?? 0) ^ 0xff;
    expect(() =>
      service.decrypt([parts[0], parts[1], parts[2], data.toString('base64')].join(':'), 'conn-1'),
    ).toThrow();
    expect(() =>
      new EncryptionService(randomBytes(32).toString('base64')).decrypt(cipher, 'conn-1'),
    ).toThrow();
  });

  it('rejects unknown formats and short keys', () => {
    expect(() => service.decrypt('v0:a:b:c')).toThrow('Unsupported ciphertext format');
    expect(() => new EncryptionService(randomBytes(16).toString('base64'))).toThrow('32 bytes');
  });
});

describe('tokens', () => {
  it('generates url-safe unique tokens', () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it('hashes deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toHaveLength(64);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('compares in constant time and handles different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('signs and verifies payloads', () => {
    const token = signPayload({ org: 'o1', nonce: 'n' }, 'secret');
    expect(verifySignedPayload<{ org: string }>(token, 'secret')?.org).toBe('o1');
    expect(verifySignedPayload(token, 'other')).toBeNull();
    expect(verifySignedPayload('garbage', 'secret')).toBeNull();
    const forged = `${Buffer.from('{"org":"o2"}').toString('base64url')}.${token.split('.')[1] ?? ''}`;
    expect(verifySignedPayload(forged, 'secret')).toBeNull();
    const notJson = Buffer.from('not json').toString('base64url');
    expect(verifySignedPayload(`${notJson}.${hmacSign(notJson, 'secret')}`, 'secret')).toBeNull();
  });
});
