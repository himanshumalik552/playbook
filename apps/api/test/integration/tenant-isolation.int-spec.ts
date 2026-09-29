import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@adpulse/database';
import { type Client, createApp, createFixture, db, destroyFixture, type Fixture, signIn } from './harness';

describe('tenant isolation', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: Fixture;
  let adminA: Client;
  let superAdmin: Client;

  beforeAll(async () => {
    app = await createApp();
    prisma = db();
    fixture = await createFixture(prisma);
    adminA = await signIn(app, fixture.users.adminA.email);
    superAdmin = await signIn(app, fixture.users.superAdmin.email);
  });

  afterAll(async () => {
    await destroyFixture(prisma, fixture);
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an organization header for an organization the user does not belong to', async () => {
    const res = await adminA.get('/organizations/current', fixture.orgB.id).expect(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('requires an organization context on tenant routes', async () => {
    const res = await adminA.get('/alerts').expect(403);
    expect(res.body.error.code).toBe('ORGANIZATION_REQUIRED');
  });

  it('rejects malformed organization ids', async () => {
    const res = await adminA.get('/alerts', "x' OR 1=1 --").expect(403);
    expect(res.body.error.code).toBe('ORGANIZATION_REQUIRED');
  });

  it.each([
    ['campaign', (f: Fixture) => `/campaigns/${f.orgB.campaignId}?from=2026-08-01&to=2026-09-01`],
    ['alert', (f: Fixture) => `/alerts/${f.orgB.alertId}`],
    ['action', (f: Fixture) => `/actions/${f.orgB.actionId}`],
    ['report', (f: Fixture) => `/reports/${f.orgB.reportId}`],
    ['report download', (f: Fixture) => `/reports/${f.orgB.reportId}/download`],
    ['recommendation', (f: Fixture) => `/recommendations/${f.orgB.recommendationId}`],
  ])('hides another tenant’s %s behind a 404', async (_label, path) => {
    await adminA.get(path(fixture), fixture.orgA.id).expect(404);
  });

  it('cannot modify another tenant’s records through its own organization', async () => {
    await adminA
      .send('patch', `/alerts/${fixture.orgB.alertId}`, { status: 'ACKNOWLEDGED' }, fixture.orgA.id)
      .expect(404);
    await adminA
      .send('post', `/actions/${fixture.orgB.actionId}/transition`, { status: 'PLANNED' }, fixture.orgA.id)
      .expect(404);
    await adminA
      .send(
        'post',
        `/recommendations/${fixture.orgB.recommendationId}/dismiss`,
        { reason: 'Not ours' },
        fixture.orgA.id,
      )
      .expect(404);
    await adminA
      .send('patch', `/ad-accounts/${fixture.orgB.adAccountId}`, { isActive: false }, fixture.orgA.id)
      .expect(404);

    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: fixture.orgB.alertId } });
    const action = await prisma.optimizationAction.findUniqueOrThrow({
      where: { id: fixture.orgB.actionId },
    });
    expect(alert.status).toBe('OPEN');
    expect(action.status).toBe('BACKLOG');
  });

  it('cannot reference another tenant’s campaign when creating an action', async () => {
    await adminA
      .send('post', '/actions', { title: 'Sneaky', campaignId: fixture.orgB.campaignId }, fixture.orgA.id)
      .expect((res) => {
        expect([400, 404, 422]).toContain(res.status);
      });
  });

  it('lists only the caller’s own data', async () => {
    const campaigns = await adminA
      .get('/campaigns?from=2026-08-01&to=2026-09-01', fixture.orgA.id)
      .expect(200);
    expect(campaigns.body.data.map((c: { id: string }) => c.id)).not.toContain(fixture.orgB.campaignId);
    const alerts = await adminA.get('/alerts', fixture.orgA.id).expect(200);
    expect(alerts.body.data.map((a: { id: string }) => a.id)).not.toContain(fixture.orgB.alertId);
    const accounts = await adminA.get('/ad-accounts', fixture.orgA.id).expect(200);
    expect(accounts.body.data).toEqual([]);
  });

  it('lists only memberships of the signed-in user', async () => {
    const res = await adminA.get('/organizations').expect(200);
    const ids = res.body.data.map((m: { organizationId: string }) => m.organizationId);
    expect(ids).toContain(fixture.orgA.id);
    expect(ids).not.toContain(fixture.orgB.id);
  });

  it('lets a platform administrator enter any organization, scoped to that organization', async () => {
    const res = await superAdmin.get(`/alerts/${fixture.orgB.alertId}`, fixture.orgB.id).expect(200);
    expect(res.body.data.id).toBe(fixture.orgB.alertId);
    await superAdmin.get(`/alerts/${fixture.orgB.alertId}`, fixture.orgA.id).expect(404);
  });
});
