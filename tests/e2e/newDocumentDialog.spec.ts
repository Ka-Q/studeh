import { test, expect } from '@playwright/test';

test('the New-document dialog rejects a whitespace-only name and stays open', async ({ page }) => {
    await page.goto('/');

    await page.locator('#btn-new').click();
    await page.locator('#new-document-name').fill('   ');
    await page.locator('#btn-confirm-new-document').click();

    await expect(page.locator('#new-document-dialog')).toBeVisible();
    await expect(page.locator('#doc-title')).toHaveText('No document open');
});

test('the New-document dialog rejects a name over the max length and stays open', async ({ page }) => {
    await page.goto('/');

    await page.locator('#btn-new').click();
    await page.locator('#new-document-name').evaluate(function setOverLengthValue(el: HTMLInputElement, value: string) {
        el.value = value;
    }, 'a'.repeat(150));
    await page.locator('#btn-confirm-new-document').click();

    await expect(page.locator('#new-document-dialog')).toBeVisible();
    await expect(page.locator('#doc-title')).toHaveText('No document open');
});
