import { test, expect } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, uniqueName } from './helpers';

async function clickBothSynchronously(page: import('@playwright/test').Page, selectorA: string, selectorB: string): Promise<void> {
    const handleA = await page.locator(selectorA).elementHandle();
    const handleB = await page.locator(selectorB).elementHandle();
    await page.evaluate(function clickBoth([a, b]) {
        (a as unknown as HTMLElement).click();
        (b as unknown as HTMLElement).click();
    }, [handleA, handleB]);
}

test('newDocumentDialog queues instead of dropping a call while already open', async ({ page }) => {
    await page.goto('/');

    await clickBothSynchronously(page, '#btn-new', '#btn-new');

    await expect(page.locator('#new-document-dialog')).toBeVisible();
    await page.locator('#new-document-name').fill(uniqueName('Queued New Doc'));
    await page.locator('#btn-confirm-new-document').click();
    await page.waitForURL(/\/doc-[a-z0-9]+$/);

    await expect(page.locator('#new-document-dialog')).toBeVisible();
    await page.locator('#btn-cancel-new-document').click();
    await expect(page.locator('#new-document-dialog')).toBeHidden();
});

test('two synchronous clicks that open the same dialog never throw and resolve FIFO', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', function onError(error) {
        pageErrors.push(error.message);
    });
    await page.goto('/');
    await createDocument(page, uniqueName('Confirm FIFO Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    await addPage(page);
    await assignActivePageImage(page);
    const pages = page.locator('.page-item');
    const firstPageId = await pages.nth(0).getAttribute('data-page-id');
    const secondPageId = await pages.nth(1).getAttribute('data-page-id');

    await clickBothSynchronously(
        page,
        `.page-item[data-page-id="${firstPageId}"] button[aria-label^="Delete page"]`,
        `.page-item[data-page-id="${secondPageId}"] button[aria-label^="Delete page"]`
    );

    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-confirm-delete').click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-confirm-delete').click();
    await expect(page.locator('#confirm-dialog')).toBeHidden();

    await expect(page.locator('.page-item')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
});

test('rapid-fire upload-error notices do not crash the notice dialog', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', function onError(error) {
        pageErrors.push(error.message);
    });
    await page.goto('/');
    await createDocument(page, uniqueName('Rapid Notice Doc'));

    await page.route('**/api/documents/*/pages/*/image', async function onRoute(route) {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unsupported image type' }) });
        } else {
            await route.continue();
        }
    });

    await page.locator('#sidebar-footer input[type="file"]').setInputFiles([
        'tests/e2e/fixtures/sample.png',
        'tests/e2e/fixtures/sample.png'
    ]);

    await expect(page.locator('#notice-dialog')).toBeVisible();
    await page.locator('#btn-notice-ok').click();
    await expect(page.locator('#notice-dialog')).toBeVisible();
    await page.locator('#btn-notice-ok').click();
    await expect(page.locator('#notice-dialog')).toBeHidden();

    expect(pageErrors).toEqual([]);
});

test('rapid browser Back/Forward on a dirty document does not crash the discard dialog', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', function onError(error) {
        pageErrors.push(error.message);
    });
    await page.goto('/');
    await createDocument(page, uniqueName('Rapid Popstate A'));
    await createDocument(page, uniqueName('Rapid Popstate B'));
    await addPage(page);
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');

    await Promise.all([page.goBack(), page.goBack()]);

    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-cancel-confirm').click();

    expect(pageErrors).toEqual([]);
});

test('popstate cancel restores the URL of the document that is actually open, not a stale snapshot', async ({ page }) => {
    await page.goto('/');
    const nameA = uniqueName('Popstate Live A');
    const docAId = await createDocument(page, nameA);
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-status')).toHaveText('Saved');

    const nameB = uniqueName('Popstate Live B');
    await createDocument(page, nameB);
    await addPage(page);

    await page.goBack();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-cancel-confirm').click();

    await expect(page.locator('#doc-title')).toHaveText(nameB);
    await expect(page).toHaveURL(function urlMatches(url) {
        return !url.pathname.endsWith(docAId);
    });
});

test('double-clicking the Browse button does not throw or break the dialog', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', function onError(error) {
        pageErrors.push(error.message);
    });
    await page.goto('/');

    await clickBothSynchronously(page, '#btn-browse', '#btn-browse');

    await expect(page.locator('#browse-dialog')).toBeVisible();
    await page.locator('#btn-close-browse-dialog').click();
    await expect(page.locator('#browse-dialog')).toBeVisible();
    await page.locator('#btn-close-browse-dialog').click();
    await expect(page.locator('#browse-dialog')).toBeHidden();

    expect(pageErrors).toEqual([]);
});
