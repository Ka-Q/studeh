import { test, expect } from '@playwright/test';
import { addPage, createDocument, uniqueName } from './helpers';

const ONE_PIXEL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function dispatchPasteWithImage(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(function dispatchPaste(base64: string) {
        const byteString = atob(base64);
        const bytes = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) {
            bytes[i] = byteString.charCodeAt(i);
        }
        const file = new File([bytes], 'paste.png', { type: 'image/png' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }));
    }, ONE_PIXEL_PNG_BASE64);
}

test('pasting an image while a text input is focused is blocked on the canvas', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Paste Guard Doc'));
    await addPage(page);

    const canvasArea = page.locator('#canvas-area');
    const box = await canvasArea.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await page.locator('#btn-rename-document').click();
    await expect(page.locator('#doc-title')).toBeFocused();

    await dispatchPasteWithImage(page);
    await page.waitForTimeout(200);

    await expect(page.locator('.canvas-empty-state')).toBeVisible();
});
