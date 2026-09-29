import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './request-context';

const VALID_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Accepts a well-formed inbound X-Request-Id (from Nginx or a client) or generates one. */
export function requestIdMiddleware(req: AppRequest, res: Response, next: NextFunction): void {
  const inbound = req.get('x-request-id');
  req.requestId = inbound && VALID_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
