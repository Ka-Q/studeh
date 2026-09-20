import { test, expect } from '@playwright/test';
import { addPage, createDocument, uniqueName } from './helpers';

test('New, add page, rename, Save, then Open round-trips all changes', async ({ page }) => {
    await page.goto('/');
    const originalName = uniqueName('Roundtrip Doc');
    const docId = await createDocument(page, originalName);

    await addPage(page);
    await expect(page.locator('.page-item')).toHaveCount(1);

    const renamedName = uniqueName('Renamed Doc');
    await page.locator('#btn-rename-document').click();
    await page.locator('#doc-title').fill(renamedName);
    await page.keyboard.press('Enter');
    await expect(page.locator('#doc-title')).toHaveText(renamedName);

    await page.locator('#btn-save').click();
    await expect(page.locator('#save-status')).toHaveText('Saved');

    await createDocument(page, uniqueName('Unrelated Doc'));
    await page.locator('#btn-browse').click();
    await page.locator('.document-open', { hasText: renamedName }).click();

    await expect(page.locator('#doc-title')).toHaveText(renamedName);
    await expect(page.locator('.page-item')).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`/${docId}$`));
});

test('confirm-discard prompt blocks New when there are unsaved changes', async ({ page }) => {
    await page.goto('/');
    const name = uniqueName('Dirty Doc');
    await createDocument(page, name);
    await addPage(page);
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');

    await page.locator('#btn-new').click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-cancel-confirm').click();
    await expect(page.locator('#confirm-dialog')).toBeHidden();
    await expect(page.locator('#doc-title')).toHaveText(name);
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');

    await page.locator('#btn-new').click();
    await page.locator('#btn-confirm-delete').click();
    await expect(page.locator('#new-document-dialog')).toBeVisible();
});

test('a failed create surfaces a visible error', async ({ page }) => {
    await page.goto('/');
    await page.route('**/api/documents', async function onRoute(route) {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
        } else {
            await route.continue();
        }
    });

    await page.locator('#btn-new').click();
    await page.locator('#btn-confirm-new-document').click();

    await expect(page.locator('#notice-dialog')).toBeVisible();
    await expect(page.locator('#notice-dialog-message')).toContainText('Failed to create document');
});

test('a failed save surfaces a visible error', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Save Fail Doc'));
    await addPage(page);

    await page.route(`**/api/documents/${docId}`, async function onRoute(route) {
        if (route.request().method() === 'PUT') {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
        } else {
            await route.continue();
        }
    });

    await page.locator('#btn-save').click();
    await expect(page.locator('#notice-dialog')).toBeVisible();
    await expect(page.locator('#notice-dialog-message')).toContainText('Failed to save document');
});

test('a failed document list surfaces a visible error when opening Browse', async ({ page }) => {
    await page.goto('/');
    await page.route('**/api/documents', async function onRoute(route) {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
        } else {
            await route.continue();
        }
    });

    await page.locator('#btn-browse').click();

    await expect(page.locator('#notice-dialog')).toBeVisible();
    await expect(page.locator('#notice-dialog-message')).toContainText('Failed to load documents');
});

test('opening a document that 404s surfaces a visible error', async ({ page }) => {
    await page.goto('/doc-doesnotexist000');

    await expect(page.locator('#notice-dialog')).toBeVisible();
    await expect(page.locator('#notice-dialog-message')).toContainText('Failed to open document');
});

test('blurring the document-title input by clicking New commits the rename to the document being edited', async ({ page }) => {
    await page.goto('/');
    const originalName = uniqueName('Blur Doc A');
    await createDocument(page, originalName);

    const renamedName = uniqueName('Blur Renamed A');
    await page.locator('#btn-rename-document').click();
    await page.locator('#doc-title').fill(renamedName);
    await page.locator('#btn-new').click();

    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-cancel-confirm').click();
    await expect(page.locator('#doc-title')).toHaveText(renamedName);
});

test('blurring the document-title input by switching documents via Browse commits the rename to the document being edited', async ({ page }) => {
    await page.goto('/');
    const otherDocName = uniqueName('Blur Other Doc');
    await createDocument(page, otherDocName);
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-status')).toHaveText('Saved');

    const originalName = uniqueName('Blur Doc B');
    await createDocument(page, originalName);

    const renamedName = uniqueName('Blur Renamed B');
    await page.locator('#btn-rename-document').click();
    await page.locator('#doc-title').fill(renamedName);

    await page.locator('#btn-browse').click();
    await page.locator('.document-open', { hasText: otherDocName }).click();

    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-cancel-confirm').click();
    await expect(page.locator('#doc-title')).toHaveText(renamedName);
});
