import { test, expect } from '@playwright/test';

test('app loads and shows the toolbar', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Studeh');
    await expect(page.locator('#toolbar')).toBeVisible();
});
