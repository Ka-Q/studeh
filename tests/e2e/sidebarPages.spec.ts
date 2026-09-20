import { test, expect } from '@playwright/test';
import { addPage, createDocument, uniqueName } from './helpers';

test('Add page appends a new page and selects it', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Add Page Doc'));

    await addPage(page);

    await expect(page.locator('.page-item')).toHaveCount(1);
    await expect(page.locator('.page-item.active')).toHaveCount(1);
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');
});

test('Deleting the active page removes it and reassigns the active page', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Delete Page Doc'));

    await addPage(page);
    await addPage(page);
    await expect(page.locator('.page-item')).toHaveCount(2);

    const firstPageId = await page.locator('.page-item').nth(0).getAttribute('data-page-id');
    const secondPageId = await page.locator('.page-item').nth(1).getAttribute('data-page-id');
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', secondPageId!);

    await page.locator('.page-item.active').getByRole('button', { name: /Delete page/ }).click();

    await expect(page.locator('.page-item')).toHaveCount(1);
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', firstPageId!);
});
