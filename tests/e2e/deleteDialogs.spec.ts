import { test, expect } from '@playwright/test';
import { addPage, createDocument, uniqueName } from './helpers';

test('deleting a document via the Browse dialog removes it from the list and the server', async ({ page }) => {
    await page.goto('/');
    const name = uniqueName('Browse Delete Doc');
    await createDocument(page, name);
    await createDocument(page, uniqueName('Other Doc'));

    await page.locator('#btn-browse').click();
    const row = page.locator('.document-item', { hasText: name });
    await row.getByRole('button', { name: 'Delete document' }).click();
    await page.locator('#btn-confirm-delete').click();

    await expect(page.locator('.document-item', { hasText: name })).toHaveCount(0);

    await page.locator('#btn-close-browse-dialog').click();
    await page.locator('#btn-browse').click();
    await expect(page.locator('.document-item', { hasText: name })).toHaveCount(0);
});

test('deleting the currently-open document clears it without a dirty-discard prompt', async ({ page }) => {
    await page.goto('/');
    const name = uniqueName('Delete Open Doc');
    await createDocument(page, name);
    await addPage(page);
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');

    await page.locator('#btn-browse').click();
    const row = page.locator('.document-item', { hasText: name });
    await row.getByRole('button', { name: 'Delete document' }).click();
    await page.locator('#btn-confirm-delete').click();

    await expect(page.locator('#confirm-dialog')).toBeHidden();
    await expect(page.locator('#doc-title')).toHaveText('No document open');
});

test('the Browse dialog is closed by default and its Cancel button closes it', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#browse-dialog')).toBeHidden();
    await expect(page.locator('#browse-dialog')).not.toHaveAttribute('open', '');

    await page.locator('#btn-browse').click();
    await expect(page.locator('#browse-dialog')).toBeVisible();

    await page.locator('#btn-close-browse-dialog').click();
    await expect(page.locator('#browse-dialog')).toBeHidden();
});

test('confirmDialog queues a second re-entrant call instead of clobbering the first', async ({ page }) => {
    await page.goto('/');
    const nameA = uniqueName('Queue Doc A');
    const nameB = uniqueName('Queue Doc B');
    await createDocument(page, nameA);
    await createDocument(page, nameB);

    await page.locator('#btn-browse').click();
    const deleteA = await page.locator('.document-item', { hasText: nameA }).getByRole('button', { name: 'Delete document' }).elementHandle();
    const deleteB = await page.locator('.document-item', { hasText: nameB }).getByRole('button', { name: 'Delete document' }).elementHandle();

    await page.evaluate(function clickBothSynchronously([a, b]) {
        (a as unknown as HTMLElement).click();
        (b as unknown as HTMLElement).click();
    }, [deleteA, deleteB]);

    await expect(page.locator('#confirm-dialog-message')).toContainText(nameA);

    await page.locator('#btn-confirm-delete').click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await expect(page.locator('#confirm-dialog-message')).toContainText(nameB);
    await page.locator('#btn-confirm-delete').click();
    await expect(page.locator('#confirm-dialog')).toBeHidden();

    await expect(page.locator('.document-item', { hasText: nameA })).toHaveCount(0);
    await expect(page.locator('.document-item', { hasText: nameB })).toHaveCount(0);
});

test('confirmDialog resolves true only on Confirm; Cancel, backdrop, and Escape resolve false', async ({ page }) => {
    await page.goto('/');
    const name = uniqueName('Confirm Resolve Doc');
    await createDocument(page, name);

    async function openDeleteConfirm(): Promise<void> {
        await page.locator('#btn-browse').click();
        await page.locator('.document-item', { hasText: name }).getByRole('button', { name: 'Delete document' }).click();
    }

    await openDeleteConfirm();
    await page.locator('#btn-cancel-confirm').click();
    await page.locator('#btn-close-browse-dialog').click();
    await expect(page.locator('#confirm-dialog')).toBeHidden();

    await openDeleteConfirm();
    await page.keyboard.press('Escape');
    await page.locator('#btn-close-browse-dialog').click();

    await openDeleteConfirm();
    await page.locator('#confirm-dialog').click({ position: { x: 2, y: 2 } });
    await page.locator('#btn-close-browse-dialog').click();

    await page.locator('#btn-browse').click();
    await expect(page.locator('.document-item', { hasText: name })).toHaveCount(1);

    await page.locator('.document-item', { hasText: name }).getByRole('button', { name: 'Delete document' }).click();
    await page.locator('#btn-confirm-delete').click();
    await expect(page.locator('.document-item', { hasText: name })).toHaveCount(0);
});

test('confirmDiscardIfDirty is awaited by New, Browse-row switching, and browser back/forward', async ({ page }) => {
    await page.goto('/');
    const nameA = uniqueName('Discard Guard A');
    await createDocument(page, nameA);
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-status')).toHaveText('Saved');

    const nameB = uniqueName('Discard Guard B');
    const docBId = await createDocument(page, nameB);
    await addPage(page);
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');

    await page.locator('#btn-new').click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-cancel-confirm').click();
    await expect(page.locator('#doc-title')).toHaveText(nameB);

    await page.locator('#btn-browse').click();
    await page.locator('.document-open', { hasText: nameA }).click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-cancel-confirm').click();
    await expect(page.locator('#doc-title')).toHaveText(nameB);
    await expect(page).toHaveURL(new RegExp(`/${docBId}$`));

    await page.goBack();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.locator('#btn-cancel-confirm').click();
    await expect(page.locator('#doc-title')).toHaveText(nameB);
    await expect(page).toHaveURL(new RegExp(`/${docBId}$`));
});
