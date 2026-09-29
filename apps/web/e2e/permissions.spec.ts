import { type APIRequestContext, type APIResponse, expect, type Page, request, test } from '@playwright/test';
import type { CurrentUser } from '@adpulse/types';
import { authFile, ORGS } from './support';

async function organizationIds(context: APIRequestContext): Promise<Record<string, string>> {
  const { data } = (await (await context.get('/api/v1/users/me')).json()) as { data: CurrentUser };
  return Object.fromEntries(data.memberships.map((m) => [m.organizationName, m.organizationId]));
}

async function errorCode(response: APIResponse) {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

async function csrfToken(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === 'adpulse_csrf')?.value ?? '';
}

test.use({ storageState: authFile('viewer') });

test('hides management controls from a viewer', async ({ page }) => {
  await page.goto('/actions?view=list');
  await expect(page.getByRole('table', { name: 'Optimization actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New action' })).toHaveCount(0);

  await page.goto('/team');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite' })).toHaveCount(0);
});

test('blocks the platform admin area for non-admins', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText('You do not have access to this')).toBeVisible();
  const response = await page.request.get('/api/v1/admin/health');
  expect(response.status()).toBe(403);
});

test('rejects writes outside the viewer role even with a valid session', async ({ page }) => {
  await page.goto('/dashboard');
  const ids = await organizationIds(page.request);
  const response = await page.request.post('/api/v1/actions', {
    headers: { 'X-Organization-Id': ids[ORGS.northwind] ?? '', 'X-CSRF-Token': await csrfToken(page) },
    data: { title: 'Should not be created', priority: 'MEDIUM' },
  });
  expect(response.status()).toBe(403);
  expect(await errorCode(response)).toBe('INSUFFICIENT_PERMISSIONS');
});

test('rejects an organization the user is not a member of', async ({ page, baseURL }) => {
  const admin = await request.newContext({ baseURL, storageState: authFile('admin') });
  const fabrikamId = (await organizationIds(admin))[ORGS.fabrikam];
  await admin.dispose();
  expect(fabrikamId).toBeTruthy();

  const response = await page.request.get('/api/v1/campaigns', {
    headers: { 'X-Organization-Id': fabrikamId ?? '' },
  });
  expect(response.status()).toBe(403);
  expect(await errorCode(response)).toBe('NOT_A_MEMBER');
});
