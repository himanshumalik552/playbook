import { expect, type Page } from '@playwright/test';

/** Development-only seed accounts (see apps/worker/src/cli/seed.ts). */
export const DEMO_PASSWORD = process.env.DEV_DEMO_PASSWORD ?? 'AdPulse-Demo-2026!';
export const USERS = {
  admin: 'admin@northwind.demo',
  viewer: 'viewer@northwind.demo',
} as const;
export const ORGS = {
  northwind: 'Northwind Outdoor Group',
  fabrikam: 'Fabrikam Retail',
} as const;

export const authFile = (role: keyof typeof USERS) => `e2e/.auth/${role}.json`;

export async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

export async function selectOrganization(page: Page, name: string) {
  const switcher = page.getByRole('combobox', { name: 'Organization' });
  if ((await switcher.textContent())?.includes(name)) return;
  await switcher.click();
  await page.getByRole('option').filter({ hasText: name }).click();
  await expect(switcher).toContainText(name);
}

export async function chooseOption(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}
