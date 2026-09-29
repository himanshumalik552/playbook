import { expect, test } from '@playwright/test';
import { authFile, chooseOption, ORGS, selectOrganization } from './support';

test.use({ storageState: authFile('admin') });

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
});

test('shows the demo dashboard with KPIs, charts and top campaigns', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Spend', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ROAS', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trend' })).toBeVisible();
  const topCampaigns = page.getByRole('table', { name: 'Top campaigns by spend' });
  await expect(topCampaigns.locator('tbody tr').first()).toBeVisible();
});

test('filters by date range and campaign through the URL', async ({ page }) => {
  await chooseOption(page, 'Date range', 'Last 7 days');
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}.*to=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole('combobox', { name: 'Date range' })).toHaveText('Last 7 days');

  const filters = page.getByRole('region', { name: 'Filters' });
  await filters.getByRole('combobox', { name: 'Campaigns' }).click();
  const option = page.getByRole('option').first();
  const campaignName = ((await option.textContent()) ?? '').trim();
  await option.click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/campaignIds=[a-z0-9]+/);
  await expect(filters.getByRole('button', { name: campaignName })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Date range' })).toHaveText('Last 7 days');
  await expect(page).toHaveURL(/campaignIds=/);
});

test('switches between organizations with different roles', async ({ page }) => {
  await selectOrganization(page, ORGS.fabrikam);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Connect a data source to see performance')).toBeVisible();

  await selectOrganization(page, ORGS.northwind);
  await expect(page.getByRole('heading', { name: 'Spend', exact: true })).toBeVisible();
});
