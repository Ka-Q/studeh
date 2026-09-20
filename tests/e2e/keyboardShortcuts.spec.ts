import { test, expect } from '@playwright/test';
import { addPage, createDocument, uniqueName } from './helpers';

test('Ctrl+Up/Down reorders the active page; plain arrows only navigate', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Reorder Doc'));
    await addPage(page);
    await addPage(page);
    await addPage(page);
    const ids = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });

    await page.locator('.page-item').nth(1).locator('.page-thumb').click();
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', ids[1]!);

    await page.keyboard.press('Control+ArrowUp');
    let order = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });
    expect(order).toEqual([ids[1], ids[0], ids[2]]);
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', ids[1]!);

    await page.keyboard.press('Control+ArrowDown');
    await page.keyboard.press('Control+ArrowDown');
    order = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });
    expect(order).toEqual([ids[0], ids[2], ids[1]]);
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', ids[1]!);

    await page.keyboard.press('ArrowUp');
    order = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });
    expect(order).toEqual([ids[0], ids[2], ids[1]]);
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', ids[2]!);
});

test('bare F2 renames the document; Ctrl+F2 renames the active page, never both', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('F2 Doc'));
    await addPage(page);

    await page.keyboard.press('F2');
    await expect(page.locator('#doc-title')).toBeFocused();
    const pageNameFocused = await page.locator('.page-item .page-name.inline-edit').count();
    expect(pageNameFocused).toBe(0);
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+F2');
    await expect(page.locator('.page-item .page-name')).toBeFocused();
    await expect(page.locator('#doc-title')).not.toBeFocused();
});

test('holding Ctrl+X only deletes one page; holding Ctrl+A only creates one page', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Key Repeat Doc'));
    await addPage(page);
    await addPage(page);
    await addPage(page);
    await expect(page.locator('.page-item')).toHaveCount(3);

    await page.evaluate(function dispatchRepeatedCtrlX() {
        const options = { key: 'x', ctrlKey: true, bubbles: true };
        document.dispatchEvent(new KeyboardEvent('keydown', { ...options, repeat: false }));
        document.dispatchEvent(new KeyboardEvent('keydown', { ...options, repeat: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { ...options, repeat: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { ...options, repeat: true }));
    });
    await expect(page.locator('.page-item')).toHaveCount(2);

    await page.evaluate(function dispatchRepeatedCtrlA() {
        const options = { key: 'a', ctrlKey: true, bubbles: true };
        document.dispatchEvent(new KeyboardEvent('keydown', { ...options, repeat: false }));
        document.dispatchEvent(new KeyboardEvent('keydown', { ...options, repeat: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { ...options, repeat: true }));
    });
    await expect(page.locator('.page-item')).toHaveCount(3);
});
