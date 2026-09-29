import { expect, test } from '@playwright/test';
import { signIn, USERS } from './support';

test('registers a new user and completes onboarding with demo data', async ({ page }) => {
  const stamp = Date.now();
  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Tester');
  await page.getByLabel('Work email').fill(`e2e-${stamp}@example.test`);
  await page.getByLabel(/^Password/).fill('E2e-Password-2026!');
  await page.getByLabel('Confirm password').fill('E2e-Password-2026!');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Organization name').fill(`E2E Org ${stamp}`);
  await page.getByRole('button', { name: 'Create organization' }).click();

  await expect(page.getByText('Step 2 of 6')).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await expect(page.getByText('Step 3 of 6')).toBeVisible();
  await page.getByRole('button', { name: /Explore with demo data/ }).click();

  await expect(page.getByText('Step 4 of 6')).toBeVisible();
  const accounts = page.getByRole('list', { name: 'Accessible Google Ads accounts' });
  await accounts.locator('.MuiListItemButton-root:not(.Mui-disabled)').first().click();
  await page.getByRole('button', { name: 'Import selected accounts' }).click();

  await expect(page.getByText('Step 5 of 6')).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await page.getByRole('button', { name: 'Go to dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
});

test('signs in with email and password', async ({ page }) => {
  await signIn(page, USERS.admin);
  await expect(page).toHaveURL(/\/dashboard/);
});

test('rejects unknown credentials with a generic message', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('nobody@example.test');
  await page.getByLabel('Password').fill('Definitely-Wrong-2026!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Email or password is incorrect' })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test('redirects anonymous visitors to sign in and blocks the API', async ({ page, request }) => {
  await page.goto('/campaigns');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcampaigns/);
  const response = await request.get('/api/v1/users/me');
  expect(response.status()).toBe(401);
});
