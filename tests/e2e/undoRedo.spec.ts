import { test, expect } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, getCanvas, imageOnScreenRect, saveDocument, uniqueName } from './helpers';

test('Ctrl+Z and the toolbar buttons undo and redo shape edits; undoing back to the saved document leaves it clean', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Undo Shapes Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    await saveDocument(page);
    const undoButton = page.locator('#btn-undo');
    const redoButton = page.locator('#btn-redo');
    await expect(redoButton).toBeDisabled();

    const imageRect = await imageOnScreenRect(page);
    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 100, y: imageRect.top + 100 });
    await dragOnCanvas(page, { x: imageRect.left + 140, y: imageRect.top + 20 }, { x: imageRect.left + 220, y: imageRect.top + 100 });
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');

    await getCanvas(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await undoButton.click();
    await expect(page.locator('#save-status')).not.toHaveClass(/visible/);
    await expect(undoButton).toBeEnabled();

    await redoButton.click();
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');
    await saveDocument(page);
    expect((await fetchManifest(page, docId)).pages[0].shapes).toHaveLength(1);
    await expect(redoButton).toBeEnabled();
});

test('undo brings back a deleted page with its image, also after saving and in Study mode', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Undo Page Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    await addPage(page);
    await page.locator('.page-item').first().locator('.page-thumb').click();

    await page.keyboard.press('ControlOrMeta+x');
    await page.locator('#btn-confirm-delete').click();
    await expect(page.locator('.page-item')).toHaveCount(1);
    await saveDocument(page);
    await page.locator('.canvas-mode-toggle').click();

    await page.locator('#btn-undo').click();

    await expect(page.locator('.page-item')).toHaveCount(2);
    await expect(page.locator('.page-item').nth(0)).toHaveClass(/active/);
    await expect(getCanvas(page)).toHaveAttribute('data-image', 'loaded');
});

test('Ctrl+Z while renaming a page is the text field\'s own undo, not the document\'s', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Undo Rename Doc'));
    await addPage(page);

    await page.keyboard.press('Control+F2');
    await page.keyboard.type('X');
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('Escape');

    await expect(page.locator('.page-item')).toHaveCount(1);
});
