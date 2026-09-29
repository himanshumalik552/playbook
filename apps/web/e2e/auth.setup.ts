import { test as setup } from '@playwright/test';
import { authFile, ORGS, selectOrganization, signIn, USERS } from './support';

setup('sign in as the Northwind admin', async ({ page }) => {
  await signIn(page, USERS.admin);
  await selectOrganization(page, ORGS.northwind);
  await page.context().storageState({ path: authFile('admin') });
});

setup('sign in as the Northwind viewer', async ({ page }) => {
  await signIn(page, USERS.viewer);
  await page.context().storageState({ path: authFile('viewer') });
});
