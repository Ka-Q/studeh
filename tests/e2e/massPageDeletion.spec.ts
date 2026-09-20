import { test, expect } from '@playwright/test';
import { addPage, createDocument, uniqueName } from './helpers';

async function createPages(page: import('@playwright/test').Page, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
        await addPage(page);
    }
}

test('clicking a page checkbox does not change the active page', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Checkbox Doc'));
    await createPages(page, 2);

    const activeBefore = await page.locator('.page-item.active').getAttribute('data-page-id');
    await page.locator('.page-item').nth(0).locator('.page-select-checkbox').check();

    await expect(page.locator('.page-item').nth(0).locator('.page-select-checkbox')).toBeChecked();
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', activeBefore!);
});

test('cancelling delete-selected leaves all pages and the selection untouched', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Cancel Mass Delete Doc'));
    await createPages(page, 4);

    await page.locator('.page-item').nth(0).locator('.page-select-checkbox').check();
    await page.locator('.page-item').nth(1).locator('.page-select-checkbox').check();

    await page.locator('#btn-delete-selected-pages').click();
    await page.locator('#btn-cancel-confirm').click();

    await expect(page.locator('.page-item')).toHaveCount(4);
    await expect(page.locator('.page-item').nth(0).locator('.page-select-checkbox')).toBeChecked();
    await expect(page.locator('.page-item').nth(1).locator('.page-select-checkbox')).toBeChecked();
    await expect(page.locator('.page-item').nth(2).locator('.page-select-checkbox')).not.toBeChecked();
});

test('confirming delete-selected removes exactly the selected pages', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Confirm Mass Delete Doc'));
    await createPages(page, 4);

    const ids = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });

    await page.locator('.page-item').nth(0).locator('.page-select-checkbox').check();
    await page.locator('.page-item').nth(2).locator('.page-select-checkbox').check();

    await page.locator('#btn-delete-selected-pages').click();
    await page.locator('#btn-confirm-delete').click();

    await expect(page.locator('.page-item')).toHaveCount(2);
    const remainingIds = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });
    expect(remainingIds).toEqual([ids[1], ids[3]]);
});

test('selection state self-heals to empty after a mass delete', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Selection Self Heal Doc'));
    await createPages(page, 4);

    await page.locator('.page-item').nth(0).locator('.page-select-checkbox').check();
    await page.locator('.page-item').nth(2).locator('.page-select-checkbox').check();
    await page.locator('#btn-delete-selected-pages').click();
    await page.locator('#btn-confirm-delete').click();

    await expect(page.locator('.page-item')).toHaveCount(2);
    for (const checkbox of await page.locator('.page-select-checkbox').all()) {
        await expect(checkbox).not.toBeChecked();
    }
    await expect(page.locator('#select-all-pages')).not.toBeChecked();
    await expect(page.locator('#btn-delete-selected-pages')).toBeDisabled();
});
