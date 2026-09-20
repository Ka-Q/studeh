import { test, expect } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, getCanvas, imageOnScreenRect, uniqueName } from './helpers';

test('releasing the pan modifier away from the window does not leave the cursor stuck on grab', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Pan Modifier Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    const canvas = getCanvas(page);

    await page.keyboard.down('Control');
    await page.mouse.move(imageRect.left + 100, imageRect.top + 80);
    await expect(canvas).toHaveCSS('cursor', 'grab');

    await page.evaluate(function blurWindow() {
        window.dispatchEvent(new Event('blur'));
    });
    await page.keyboard.up('Control');

    await page.mouse.move(imageRect.left + 110, imageRect.top + 90, { steps: 3 });

    await expect(canvas).not.toHaveCSS('cursor', 'grab');
});
