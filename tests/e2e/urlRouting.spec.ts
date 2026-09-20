import { test, expect } from '@playwright/test';
import { createDocument, uniqueName } from './helpers';

test('creating a document pushes /<doc-id> to the URL', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('URL Doc'));

    await expect(page).toHaveURL(new RegExp(`/${docId}$`));
});

test('a hard refresh on /<doc-id> restores that document', async ({ page }) => {
    await page.goto('/');
    const name = uniqueName('Refresh Doc');
    const docId = await createDocument(page, name);
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-status')).toHaveText('Saved');

    await page.reload();

    await expect(page).toHaveURL(new RegExp(`/${docId}$`));
    await expect(page.locator('#doc-title')).toHaveText(name);
});

test('a slow-resolving URL restore does not clobber a document opened in the meantime', async ({ page }) => {
    await page.goto('/');
    const docAName = uniqueName('Slow Restore A');
    const docAId = await createDocument(page, docAName);
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-status')).toHaveText('Saved');

    await page.route(`**/api/documents/${docAId}`, async function delayGet(route) {
        if (route.request().method() === 'GET') {
            await new Promise(function wait(resolve) { setTimeout(resolve, 1500); });
        }
        await route.continue();
    });

    await page.goto(`/${docAId}`);

    const newDocName = uniqueName('Opened In The Meantime');
    await createDocument(page, newDocName);

    await page.waitForTimeout(2000);

    await expect(page.locator('#doc-title')).toHaveText(newDocName);
});

test('browser Back and Forward restore the correct document', async ({ page }) => {
    await page.goto('/');
    const nameA = uniqueName('Back Forward A');
    const docAId = await createDocument(page, nameA);

    const nameB = uniqueName('Back Forward B');
    const docBId = await createDocument(page, nameB);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${docAId}$`));
    await expect(page.locator('#doc-title')).toHaveText(nameA);

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/${docBId}$`));
    await expect(page.locator('#doc-title')).toHaveText(nameB);
});
