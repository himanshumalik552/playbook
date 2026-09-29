import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  StreamableFile,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DomainError } from '@adpulse/core';
import { Prisma } from '@adpulse/database';
import { lastValueFrom, of } from 'rxjs';
import { EnvelopeInterceptor } from '../../src/common/envelope.interceptor';
import { GlobalExceptionFilter, mapError } from '../../src/common/exception.filter';
import { iso, num, userRef } from '../../src/common/mappers';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: 'test' });

describe('mapError', () => {
  it('maps validation errors to VALIDATION_FAILED with details', () => {
    const mapped = mapError(new BadRequestException(['name must be a string']));
    expect(mapped).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: ['name must be a string'],
    });
  });

  it('keeps explicit error codes and falls back to status codes', () => {
    expect(mapError(new HttpException({ code: 'LAST_ADMIN', message: 'Keep one admin' }, 409))).toMatchObject(
      { status: 409, code: 'LAST_ADMIN', message: 'Keep one admin' },
    );
    expect(mapError(new ForbiddenException('No'))).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'No',
    });
    expect(mapError(new HttpException('Teapot', 418))).toMatchObject({ status: 418, code: 'ERROR' });
  });

  it('maps domain, throttling and database errors', () => {
    expect(mapError(new DomainError('INVALID_STATE', 'Nope'))).toMatchObject({
      status: 409,
      code: 'INVALID_STATE',
    });
    expect(mapError(new DomainError('VALIDATION_FAILED', 'Bad'))).toMatchObject({ status: 422 });
    expect(mapError(new ThrottlerException())).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(mapError(prismaError('P2002'))).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(mapError(prismaError('P2025'))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('never leaks internal error messages', () => {
    expect(mapError(new Error('password=hunter2 connection failed'))).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});

describe('GlobalExceptionFilter', () => {
  function host(headersSent = false) {
    const res = {
      headersSent,
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    const req = {
      requestId: 'req-1',
      path: '/x',
      method: 'GET',
      route: { path: '/x' },
      user: { id: 'u1' },
      org: { organizationId: 'o1' },
    };
    return {
      res,
      host: { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as never,
    };
  }

  it('writes the error envelope and reports only server errors', () => {
    const logger = { error: jest.fn() };
    const reporter = { capture: jest.fn() };
    const filter = new GlobalExceptionFilter(logger as never, reporter as never);

    const client = host();
    filter.catch(new ForbiddenException('No'), client.host);
    expect(client.res.statusCode).toBe(403);
    expect(client.res.body).toEqual({
      success: false,
      error: { code: 'FORBIDDEN', message: 'No' },
      requestId: 'req-1',
    });
    expect(reporter.capture).not.toHaveBeenCalled();

    const server = host();
    filter.catch(new Error('boom'), server.host);
    expect(server.res.statusCode).toBe(500);
    expect(reporter.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ requestId: 'req-1', organizationId: 'o1', route: 'GET /x' }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not write after headers were sent', () => {
    const filter = new GlobalExceptionFilter({ error: jest.fn() } as never, { capture: jest.fn() } as never);
    const sent = host(true);
    filter.catch(new ForbiddenException(), sent.host);
    expect(sent.res.body).toBeUndefined();
  });
});

describe('EnvelopeInterceptor', () => {
  const context = (headersSent = false) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'req-2' }),
        getResponse: () => ({ headersSent }),
      }),
    }) as unknown as ExecutionContext;
  const run = (value: unknown, headersSent = false) =>
    lastValueFrom(
      new EnvelopeInterceptor().intercept(context(headersSent), { handle: () => of(value) } as CallHandler),
    );

  it('wraps plain values and null', async () => {
    await expect(run({ a: 1 })).resolves.toEqual({ success: true, data: { a: 1 }, requestId: 'req-2' });
    await expect(run(undefined)).resolves.toEqual({ success: true, data: null, requestId: 'req-2' });
  });

  it('lifts pagination metadata', async () => {
    const meta = { page: 1, pageSize: 25, total: 1, totalPages: 1 };
    await expect(run({ items: [1], meta })).resolves.toEqual({
      success: true,
      data: [1],
      meta,
      requestId: 'req-2',
    });
  });

  it('passes files and already-sent responses through', async () => {
    const file = new StreamableFile(Buffer.from('x'));
    await expect(run(file)).resolves.toBe(file);
    await expect(run('raw', true)).resolves.toBe('raw');
  });
});

describe('mappers', () => {
  it('converts nullable values at the API boundary', () => {
    expect(iso(new Date('2026-09-28T00:00:00.000Z'))).toBe('2026-09-28T00:00:00.000Z');
    expect(iso(null)).toBeNull();
    expect(num(new Prisma.Decimal('12.34'))).toBe(12.34);
    expect(num(BigInt(5))).toBe(5);
    expect(num(undefined)).toBeNull();
    expect(userRef({ id: 'u', name: 'N' })).toEqual({ id: 'u', name: 'N' });
    expect(userRef(null)).toBeNull();
  });
});
