import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '@adpulse/core';
import { createPrismaClient, type OrgRole, type PrismaClient } from '@adpulse/database';
import { randomBytes, randomInt } from 'node:crypto';
import request from 'supertest';

/**
 * Integration tests run against the PostgreSQL database from .env and an isolated Redis logical
 * database, so rate-limit counters and queues never mix with a running development stack.
 */
process.env.REDIS_URL = `${(process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '')}/15`;
process.env.LOG_LEVEL = 'silent';
process.env.INTEGRATION_MODE = 'mock';

export const PASSWORD = `It-${randomBytes(9).toString('base64url')}!9a`;

export interface Fixture {
  run: string;
  orgA: { id: string };
  orgB: {
    id: string;
    adAccountId: string;
    campaignId: string;
    alertId: string;
    actionId: string;
    reportId: string;
    recommendationId: string;
  };
  users: Record<
    'adminA' | 'managerA' | 'analystA' | 'viewerA' | 'adminB' | 'superAdmin',
    { id: string; email: string }
  >;
}

export async function createApp(): Promise<INestApplication> {
  const { createApp: create } = await import('../../src/bootstrap');
  const app = await create();
  await app.listen(0, '127.0.0.1');
  const { REDIS } = await import('../../src/infra/tokens');
  await app.get<{ flushdb(): Promise<unknown> }>(REDIS).flushdb();
  return app;
}

/** Base URL of the listening test app; supertest's cookie agent needs a stable address. */
export async function baseUrl(app: INestApplication): Promise<string> {
  return (await app.getUrl()).replace('[::1]', '127.0.0.1');
}

export function db(): PrismaClient {
  return createPrismaClient();
}

export async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const run = randomBytes(4).toString('hex');
  const passwordHash = await hashPassword(PASSWORD);
  const user = async (key: string, systemRole: 'USER' | 'SUPER_ADMIN' = 'USER') => {
    const email = `it-${run}-${key.toLowerCase()}@adpulse.test`;
    const row = await prisma.user.create({
      data: { email, name: `IT ${key}`, passwordHash, systemRole, emailVerifiedAt: new Date() },
    });
    return { id: row.id, email };
  };
  const users = {
    adminA: await user('adminA'),
    managerA: await user('managerA'),
    analystA: await user('analystA'),
    viewerA: await user('viewerA'),
    adminB: await user('adminB'),
    superAdmin: await user('super', 'SUPER_ADMIN'),
  };
  const org = (slug: string, members: [string, OrgRole][]) =>
    prisma.organization.create({
      data: {
        name: `IT ${slug} ${run}`,
        slug: `it-${slug}-${run}`,
        timezone: 'UTC',
        onboardingCompletedAt: new Date(),
        memberships: { create: members.map(([userId, role]) => ({ userId, role })) },
      },
    });
  const orgA = await org('a', [
    [users.adminA.id, 'ORGANIZATION_ADMIN'],
    [users.managerA.id, 'MARKETING_MANAGER'],
    [users.analystA.id, 'ANALYST'],
    [users.viewerA.id, 'VIEWER'],
  ]);
  const orgB = await org('b', [[users.adminB.id, 'ORGANIZATION_ADMIN']]);

  const account = await prisma.adAccount.create({
    data: {
      organizationId: orgB.id,
      customerId: String(randomInt(1_000_000_000, 9_999_999_999)),
      name: 'B account',
      currencyCode: 'USD',
      timezone: 'UTC',
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      organizationId: orgB.id,
      adAccountId: account.id,
      externalId: '1',
      name: 'B campaign',
      status: 'ENABLED',
      channelType: 'SEARCH',
      objective: 'SEARCH',
    },
  });
  const day = new Date('2026-09-01T00:00:00.000Z');
  const alert = await prisma.alert.create({
    data: {
      organizationId: orgB.id,
      adAccountId: account.id,
      campaignId: campaign.id,
      type: 'HIGH_SPEND_ZERO_CONVERSIONS',
      severity: 'WARNING',
      entityType: 'CAMPAIGN',
      entityId: campaign.id,
      metric: 'cost',
      windowStart: day,
      windowEnd: day,
      explanation: 'Fixture',
      suggestedInvestigation: 'Fixture',
      fingerprint: `it-${run}`,
    },
  });
  const action = await prisma.optimizationAction.create({
    data: { organizationId: orgB.id, title: 'B action', campaignId: campaign.id },
  });
  const report = await prisma.generatedReport.create({
    data: {
      organizationId: orgB.id,
      title: 'B report',
      frequency: 'CUSTOM',
      format: 'PDF',
      periodStart: day,
      periodEnd: day,
    },
  });
  const recommendation = await prisma.recommendation.create({
    data: {
      organizationId: orgB.id,
      type: 'REVIEW_EXPENSIVE_SEARCH_TERMS',
      title: 'B recommendation',
      rationale: 'Fixture',
      confidence: 'LOW',
      entityType: 'CAMPAIGN',
      entityId: campaign.id,
      fingerprint: `it-${run}`,
    },
  });

  return {
    run,
    orgA: { id: orgA.id },
    orgB: {
      id: orgB.id,
      adAccountId: account.id,
      campaignId: campaign.id,
      alertId: alert.id,
      actionId: action.id,
      reportId: report.id,
      recommendationId: recommendation.id,
    },
    users,
  };
}

/** Removes fixture data, including the audit entries it produced (via the sanctioned purge path). */
export async function destroyFixture(prisma: PrismaClient, fixture: Fixture): Promise<void> {
  const orgIds = [fixture.orgA.id, fixture.orgB.id];
  const userIds = Object.values(fixture.users).map((u) => u.id);
  const auditIds = (
    await prisma.auditLog.findMany({
      where: { OR: [{ organizationId: { in: orgIds } }, { actorId: { in: userIds } }] },
      select: { id: true },
    })
  ).map((a) => a.id);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('adpulse.audit_purge', 'on', true)`;
    await tx.auditLog.deleteMany({ where: { id: { in: auditIds } } });
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

export interface Client {
  get(path: string, org?: string): request.Test;
  send(method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: object, org?: string): request.Test;
}

/** Minimal browser-like cookie jar (path scoping is not needed for these tests). */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(res: request.Response): void {
    for (const header of ([] as string[]).concat(res.headers['set-cookie'] ?? [])) {
      const [pair = ''] = header.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1);
      if (/expires=Thu, 01 Jan 1970/i.test(header) || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/** Sends cookies and the double-submit CSRF header the way the SPA does. */
export function browser(base: string) {
  const jar = new CookieJar();
  const prepare = (test: request.Test, org?: string) => {
    const csrf = jar.get('adpulse_csrf');
    let t = test.set('Cookie', jar.header());
    if (csrf) t = t.set('X-CSRF-Token', csrf);
    if (org) t = t.set('X-Organization-Id', org);
    return t.on('response', (res: request.Response) => jar.store(res));
  };
  const client: Client = {
    get: (path, org) => prepare(request(base).get(`/api/v1${path}`), org),
    send: (method, path, body, org) => prepare(request(base)[method](`/api/v1${path}`), org).send(body ?? {}),
  };
  return { client, jar };
}

export async function signIn(app: INestApplication, email: string, password = PASSWORD): Promise<Client> {
  const { client } = browser(await baseUrl(app));
  await client.get('/auth/csrf').expect(200);
  await client.send('post', '/auth/login', { email, password }).expect(200);
  return client;
}
