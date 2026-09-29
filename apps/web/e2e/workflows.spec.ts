import { expect, test } from '@playwright/test';
import { authFile } from './support';

test.use({ storageState: authFile('admin') });

test('reviews an open alert and acknowledges it', async ({ page }) => {
  await page.goto('/alerts?status=OPEN');
  await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible();
  await page.locator('tbody tr[tabindex="0"]').first().click();

  const drawer = page.locator('.MuiDrawer-paper');
  await expect(drawer.getByRole('heading', { name: 'Alert detail' })).toBeVisible();
  await expect(drawer.getByText('What was detected')).toBeVisible();
  await expect(drawer.getByText('Suggested investigation')).toBeVisible();

  await drawer.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Acknowledged' }).click();
  await drawer.getByLabel('Note').fill('Reviewed during end-to-end test');
  await drawer.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Alert updated')).toBeVisible();
  await expect(drawer.getByText('Acknowledged').first()).toBeVisible();
});

test('creates an optimization action', async ({ page }) => {
  const title = `Tighten match types ${Date.now()}`;
  await page.goto('/actions?view=list');
  await page.getByRole('button', { name: 'New action' }).click();

  const dialog = page.getByRole('dialog', { name: 'Create optimization action' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Hypothesis').fill('Exact match will reduce wasted spend on irrelevant queries.');
  await dialog.getByRole('button', { name: 'Create action' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Action created')).toBeVisible();
  const drawer = page.locator('.MuiDrawer-paper');
  await expect(drawer.getByText(title)).toBeVisible();
  await expect(drawer.getByText('Backlog').first()).toBeVisible();

  await drawer.getByRole('button', { name: 'Close action detail' }).click();
  await expect(page.getByRole('table', { name: 'Optimization actions' }).getByText(title)).toBeVisible();
});

test('generates a report and lists it in the history', async ({ page }) => {
  const title = `E2E performance report ${Date.now()}`;
  await page.goto('/reports');
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect(page.getByText(/queued\. It appears on the History tab/)).toBeVisible();
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText(title)).toBeVisible();
});
