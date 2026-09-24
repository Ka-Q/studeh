import { test, expect, type Page } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, getCanvas, imageOnScreenRect, resetZoomTo100, saveDocument, uniqueName } from './helpers';

function zoomInButton(page: Page) {
    return page.locator('.canvas-zoom button[aria-label="Zoom in"]');
}
function zoomOutButton(page: Page) {
    return page.locator('.canvas-zoom button[aria-label="Zoom out"]');
}
function resetButton(page: Page) {
    return page.locator('.canvas-zoom button[aria-label^="Reset"]');
}
function fitButton(page: Page) {
    return page.locator('.canvas-zoom button[aria-label="Fit to view"]');
}

test('zoom buttons step by 10 points, the reset button returns to 100%, and bounds disable the matching button', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Zoom Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    await resetZoomTo100(page);

    const percent = page.locator('.canvas-zoom-percent');
    const zoomIn = zoomInButton(page);
    const zoomOut = zoomOutButton(page);
    const reset = resetButton(page);

    await expect(percent).toHaveText('100');
    await expect(reset).toBeDisabled();

    await zoomIn.click();
    await expect(percent).toHaveText('110');
    await expect(reset).toBeEnabled();

    await reset.click();
    await expect(percent).toHaveText('100');
    await expect(reset).toBeDisabled();

    for (let i = 0; i < 9; i++) {
        await zoomOut.click();
    }
    await expect(percent).toHaveText('10');
    await expect(zoomOut).toBeDisabled();

    await reset.click();
    for (let i = 0; i < 70; i++) {
        await zoomIn.click();
    }
    await expect(percent).toHaveText('800');
    await expect(zoomIn).toBeDisabled();
});

test('double-clicking the zoom percentage commits a clamped precise value, or reverts on invalid input', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Zoom Precise Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    const percent = page.locator('.canvas-zoom-percent');

    await percent.dblclick();
    const input = page.locator('.canvas-zoom input.inline-edit');
    await input.fill('250');
    await input.press('Enter');
    await expect(percent).toHaveText('250');

    await percent.dblclick();
    await page.locator('.canvas-zoom input.inline-edit').fill('999');
    await page.locator('.canvas-zoom input.inline-edit').press('Enter');
    await expect(percent).toHaveText('800');

    await percent.dblclick();
    await page.locator('.canvas-zoom input.inline-edit').fill('not a number');
    await page.locator('.canvas-zoom input.inline-edit').press('Enter');
    await expect(percent).toHaveText('800');

    await percent.dblclick();
    await page.locator('.canvas-zoom input.inline-edit').press('Escape');
    await expect(percent).toHaveText('800');
});

test('mouse-wheel zoom updates the readout live', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Zoom Wheel Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    const percent = page.locator('.canvas-zoom-percent');
    const imageRect = await imageOnScreenRect(page);
    await page.mouse.move(imageRect.left + imageRect.width / 2, imageRect.top + imageRect.height / 2);

    await expect(percent).toHaveText('100');
    await page.mouse.wheel(0, -200);
    await expect(percent).not.toHaveText('100');
});

test('the zoom control is hidden when the active page has no image assigned', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Zoom Empty Doc'));
    await addPage(page);

    await expect(page.locator('.canvas-zoom')).toBeHidden();

    await assignActivePageImage(page);
    await expect(page.locator('.canvas-zoom')).toBeVisible();
});

test('fit to view resets both zoom and pan back to the pristine just-opened view', async ({ page }) => {
    await page.goto('/');
    const documentId = await createDocument(page, uniqueName('Zoom Fit-to-View Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    const percent = page.locator('.canvas-zoom-percent');
    const pristinePercent = await percent.textContent();
    const canvasBox = await getCanvas(page).boundingBox();
    if (!canvasBox) {
        throw new Error('Canvas has no bounding box');
    }
    const probePoint = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };

    // Draw a reference shape at a fixed screen point in the pristine view.
    await dragOnCanvas(page, probePoint, { x: probePoint.x + 40, y: probePoint.y + 40 });

    // Drift away from the pristine view: zoom in, then pan.
    await zoomInButton(page).click();
    await zoomInButton(page).click();
    await page.keyboard.down('Control');
    await dragOnCanvas(page, probePoint, { x: probePoint.x - 70, y: probePoint.y - 50 });
    await page.keyboard.up('Control');
    await expect(percent).not.toHaveText(pristinePercent ?? '');

    await fitButton(page).click();
    await expect(percent).toHaveText(pristinePercent ?? '');

    // If pan and zoom are truly back to their pristine values, a click at the same
    // screen point should still land exactly on the reference shape and select it.
    await page.mouse.click(probePoint.x + 5, probePoint.y + 5);
    await page.keyboard.press('Delete');

    await saveDocument(page);
    const manifest = await fetchManifest(page, documentId);
    expect(manifest.pages[0].shapes).toHaveLength(0);
});

test('+/-/0 keyboard shortcuts step, reset, and fit zoom, in both edit and study mode', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Zoom Keyboard Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    await getCanvas(page).click();

    const percent = page.locator('.canvas-zoom-percent');
    const fitPercent = await percent.textContent();

    await page.keyboard.press('0');
    await expect(percent).toHaveText('100');

    await page.keyboard.press('+');
    await expect(percent).toHaveText('110');

    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect(percent).toHaveText('90');

    await page.keyboard.press('0');
    await expect(percent).toHaveText('100');

    await zoomInButton(page).click();
    await zoomInButton(page).click();
    await expect(percent).not.toHaveText('100');
    await page.keyboard.press('=');
    await expect(percent).toHaveText(fitPercent ?? '');

    await page.locator('.canvas-mode-toggle').click();
    await page.keyboard.press('+');
    await expect(percent).toHaveText(String(Number(fitPercent) + 10));
});

test('the zoom control stays visible and usable through a fullscreen transition', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Zoom Fullscreen Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    await page.locator('.canvas-mode-toggle').click();
    await page.locator('button:has-text("Fullscreen")').click();
    await getCanvas(page).waitFor();

    const percent = page.locator('.canvas-zoom-percent');
    await expect(page.locator('.canvas-zoom')).toBeVisible();

    // Fit isn't recomputed by the resize alone, so the pre-fullscreen fit percent
    // (for a different canvas size) can't stand in for this canvas's fit percent.
    await fitButton(page).click();
    const fitPercent = await percent.textContent();

    await zoomInButton(page).click();
    await expect(percent).not.toHaveText(fitPercent ?? '');

    await page.keyboard.press('=');
    await expect(percent).toHaveText(fitPercent ?? '');
    await page.keyboard.press('+');
    await expect(percent).not.toHaveText(fitPercent ?? '');
});
