import { test, expect } from '@playwright/test';

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
