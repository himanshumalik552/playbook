import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@adpulse/database';
import request from 'supertest';
import {
  baseUrl,
  browser,
  createApp,
  createFixture,
  db,
  destroyFixture,
  type Fixture,
  PASSWORD,
  signIn,
} from './harness';

describe('authentication and session security', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: Fixture;

  beforeAll(async () => {
    app = await createApp();
    prisma = db();
    fixture = await createFixture(prisma);
  });

  afterAll(async () => {
    await destroyFixture(prisma, fixture);
    await prisma.$disconnect();
    await app.close();
  });

  it('wraps responses in an envelope with a request id', async () => {
    const res = await request(await baseUrl(app))
      .get('/api/v1/health/live')
      .expect(200);
    expect(res.body).toMatchObject({ success: true, requestId: expect.any(String) });
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('rejects unauthenticated access to tenant data', async () => {
    const res = await request(await baseUrl(app))
      .get('/api/v1/campaigns')
      .expect(401);
    expect(res.body.success).toBe(false);
  });

  it('requires the CSRF token for state-changing requests', async () => {
    const res = await request(await baseUrl(app))
      .post('/api/v1/auth/login')
      .send({ email: fixture.users.adminA.email, password: PASSWORD })
      .expect(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('issues HttpOnly session cookies and never returns tokens in the body', async () => {
    const { client } = browser(await baseUrl(app));
    await client.get('/auth/csrf').expect(200);
    const res = await client
      .send('post', '/auth/login', { email: fixture.users.adminA.email, password: PASSWORD })
      .expect(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.find((c) => c.startsWith('adpulse_at='))).toMatch(/HttpOnly/i);
    const refresh = cookies.find((c) => c.startsWith('adpulse_rt='));
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/);
  });

  it('does not reveal whether an email exists', async () => {
    const { client } = browser(await baseUrl(app));
    await client.get('/auth/csrf').expect(200);
    const unknown = await client.send('post', '/auth/login', {
      email: `nobody-${fixture.run}@adpulse.test`,
      password: 'Wrong-password-1',
    });
    const wrong = await client.send('post', '/auth/login', {
      email: fixture.users.viewerA.email,
      password: 'Wrong-password-1',
    });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toEqual(wrong.body.error);
  });

  it('rejects unknown fields instead of silently accepting them', async () => {
    const client = await signIn(app, fixture.users.adminA.email);
    const res = await client
      .send('patch', '/users/me', { name: 'Ok', systemRole: 'SUPER_ADMIN' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('invalidates the session on logout', async () => {
    const client = await signIn(app, fixture.users.analystA.email);
    await client.get('/users/me').expect(200);
    await client.send('post', '/auth/logout').expect(200);
    await client.get('/users/me').expect(401);
  });
});

describe('integrations', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: Fixture;

  beforeAll(async () => {
    app = await createApp();
    prisma = db();
    fixture = await createFixture(prisma);
  });

  afterAll(async () => {
    await destroyFixture(prisma, fixture);
    await prisma.$disconnect();
    await app.close();
  });

  it('reports mock mode and refuses the live OAuth flow without credentials', async () => {
    const admin = await signIn(app, fixture.users.adminA.email);
    const overview = await admin.get('/integrations', fixture.orgA.id).expect(200);
    expect(overview.body.data).toMatchObject({ mode: 'mock', googleConfigured: false, connections: [] });
    const res = await admin
      .send('post', '/integrations/google/connect', { provider: 'GOOGLE_ADS' }, fixture.orgA.id)
      .expect(503);
    expect(res.body.error.code).toBe('INTEGRATION_UNAVAILABLE');
  });

  it('rejects a callback whose state was not issued to this browser', async () => {
    const res = await request(await baseUrl(app))
      .get('/api/v1/integrations/google/callback?code=abc&state=forged')
      .expect(302);
    expect(res.headers.location).toContain('error=connect_failed');
  });

  it('connects demo data, imports selected accounts and queues an initial sync', async () => {
    const admin = await signIn(app, fixture.users.adminA.email);
    const connection = await admin
      .send('post', '/integrations/demo', { provider: 'GOOGLE_ADS' }, fixture.orgA.id)
      .expect(201);
    expect(connection.body.data).toMatchObject({ provider: 'GOOGLE_ADS', isMock: true, status: 'ACTIVE' });
    const id = connection.body.data.id as string;

    const accessible = await admin.get(`/integrations/${id}/accounts`, fixture.orgA.id).expect(200);
    const clients = accessible.body.data.filter((a: { isManager: boolean }) => !a.isManager);
    expect(clients.length).toBeGreaterThan(0);

    const manager = accessible.body.data.find((a: { isManager: boolean }) => a.isManager);
    await admin
      .send('put', `/integrations/${id}/accounts`, { customerIds: [manager.customerId] }, fixture.orgA.id)
      .expect(400);

    const selected = await admin
      .send('put', `/integrations/${id}/accounts`, { customerIds: [clients[0].customerId] }, fixture.orgA.id)
      .expect(200);
    expect(selected.body.data.initialSyncsQueued).toBe(1);
    const active = selected.body.data.accounts.filter((a: { isActive: boolean }) => a.isActive);
    expect(active.map((a: { customerId: string }) => a.customerId)).toEqual([clients[0].customerId]);

    const jobs = await prisma.syncJob.findMany({ where: { organizationId: fixture.orgA.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: 'INITIAL', status: 'QUEUED' });
  });

  it('disconnecting deactivates accounts and stores no token', async () => {
    const admin = await signIn(app, fixture.users.adminA.email);
    const overview = await admin.get('/integrations', fixture.orgA.id).expect(200);
    const connection = overview.body.data.connections.find((c: { status: string }) => c.status === 'ACTIVE');
    await admin.send('delete', `/integrations/${connection.id}`, {}, fixture.orgA.id).expect(204);

    const row = await prisma.oAuthConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(row).toMatchObject({ status: 'REVOKED', encryptedRefreshToken: null });
    const active = await prisma.adAccount.count({
      where: { organizationId: fixture.orgA.id, isActive: true },
    });
    expect(active).toBe(0);
    await admin.get(`/integrations/${connection.id}/accounts`, fixture.orgA.id).expect(409);
  });

  it('keeps audit entries immutable', async () => {
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: fixture.orgA.id } });
    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/immutable/);
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/immutable/);
  });
});
