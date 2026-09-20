import { test, expect } from '@playwright/test';
import { addPage, createDocument, uniqueName } from './helpers';

test('Ctrl+D opens the New-document dialog on a non-Mac platform', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Control+d');

    await expect(page.locator('#new-document-dialog')).toBeVisible();
});

test('Cmd (Meta), not Ctrl, opens the New-document dialog on a Mac platform', async ({ browser }) => {
    const macContext = await browser.newContext();
    await macContext.addInitScript(function spoofMac() {
        Object.defineProperty(navigator, 'platform', { get: function get() { return 'MacIntel'; } });
    });
    const macPage = await macContext.newPage();
    await macPage.goto('/');

    await macPage.keyboard.press('Control+d');
    await expect(macPage.locator('#new-document-dialog')).toBeHidden();

    await macPage.keyboard.press('Meta+d');
    await expect(macPage.locator('#new-document-dialog')).toBeVisible();

    await macContext.close();
});

test('on a Mac platform, Cmd (not Ctrl) triggers the pan cursor', async ({ browser }) => {
    const macContext = await browser.newContext();
    await macContext.addInitScript(function spoofMac() {
        Object.defineProperty(navigator, 'platform', { get: function get() { return 'MacIntel'; } });
    });
    const macPage = await macContext.newPage();
    await macPage.goto('/');
    await createDocument(macPage, uniqueName('Mac Pan Doc'));
    await addPage(macPage);
    await macPage.locator('#canvas-area input[type="file"]').first().setInputFiles('tests/e2e/fixtures/sample.png');
    const canvas = macPage.locator('#canvas-area .canvas-body canvas');
    await canvas.waitFor();
    const box = await canvas.boundingBox();

    await macPage.keyboard.down('Control');
    await macPage.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(canvas).not.toHaveCSS('cursor', 'grab');
    await macPage.keyboard.up('Control');

    await macPage.keyboard.down('Meta');
    await macPage.mouse.move(box!.x + box!.width / 2 + 5, box!.y + box!.height / 2 + 5);
    await expect(canvas).toHaveCSS('cursor', 'grab');
    await macPage.keyboard.up('Meta');

    await macContext.close();
});
