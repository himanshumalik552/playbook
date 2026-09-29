import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@adpulse/database';
import { type Client, createApp, createFixture, db, destroyFixture, type Fixture, signIn } from './harness';

describe('role-based access control', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: Fixture;
  const clients = {} as Record<'admin' | 'manager' | 'analyst' | 'viewer' | 'superAdmin', Client>;

  beforeAll(async () => {
    app = await createApp();
    prisma = db();
    fixture = await createFixture(prisma);
    clients.admin = await signIn(app, fixture.users.adminA.email);
    clients.manager = await signIn(app, fixture.users.managerA.email);
    clients.analyst = await signIn(app, fixture.users.analystA.email);
    clients.viewer = await signIn(app, fixture.users.viewerA.email);
    clients.superAdmin = await signIn(app, fixture.users.superAdmin.email);
  });

  afterAll(async () => {
    await destroyFixture(prisma, fixture);
    await prisma.$disconnect();
    await app.close();
  });

  const org = () => fixture.orgA.id;

  it('lets every role read analytics', async () => {
    for (const client of [clients.viewer, clients.analyst, clients.manager, clients.admin]) {
      await client.get('/alerts', org()).expect(200);
    }
  });

  it('keeps viewers read-only', async () => {
    const res = await clients.viewer.send('post', '/actions', { title: 'Viewer action' }, org()).expect(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    await clients.viewer.send('post', '/reports', { format: 'PDF' }, org()).expect(403);
  });

  it('lets analysts create actions but not assign them to others or manage targets', async () => {
    const created = await clients.analyst
      .send('post', '/actions', { title: 'Analyst action' }, org())
      .expect(201);
    expect(created.body.data.title).toBe('Analyst action');
    await clients.analyst
      .send('post', '/actions', { title: 'Assigned', ownerId: fixture.users.managerA.id }, org())
      .expect(403);
    await clients.analyst
      .send('put', '/targets', { scope: 'ORGANIZATION', metric: 'CPA', value: 50 }, org())
      .expect(403);
  });

  it('restricts audit logs to managers and above', async () => {
    await clients.analyst.get('/audit-logs', org()).expect(403);
    const res = await clients.manager.get('/audit-logs', org()).expect(200);
    expect(res.body.data.every((row: { action: string }) => typeof row.action === 'string')).toBe(true);
  });

  it('restricts organization settings, members and integrations to organization admins', async () => {
    await clients.manager.send('patch', '/organizations/current', { name: 'Renamed' }, org()).expect(403);
    await clients.manager
      .send('post', '/invitations', { email: 'x@adpulse.test', role: 'VIEWER' }, org())
      .expect(403);
    await clients.manager.send('post', '/integrations/demo', { provider: 'GOOGLE_ADS' }, org()).expect(403);
    await clients.admin.get('/memberships', org()).expect(200);
  });

  it('prevents admins from escalating anyone to platform administrator via membership roles', async () => {
    const members = await clients.admin.get('/memberships', org()).expect(200);
    const viewer = members.body.data.find((m: { userId: string }) => m.userId === fixture.users.viewerA.id);
    await clients.admin
      .send('patch', `/memberships/${viewer.id}`, { role: 'SUPER_ADMIN' }, org())
      .expect(400);
  });

  it('refuses to remove the last organization admin', async () => {
    const members = await clients.admin.get('/memberships', org()).expect(200);
    const self = members.body.data.find((m: { userId: string }) => m.userId === fixture.users.adminA.id);
    const res = await clients.admin.send('delete', `/memberships/${self.id}`, {}, org()).expect(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
  });

  it('restricts the platform admin area to super admins', async () => {
    await clients.admin.get('/admin/health').expect(403);
    const res = await clients.superAdmin.get('/admin/health').expect(200);
    expect(res.body.data).toMatchObject({ database: 'up', integrationMode: 'mock' });
    await clients.superAdmin.get('/admin/queues').expect(200);
    await clients.superAdmin.get('/admin/failed-jobs').expect(200);
  });
});
