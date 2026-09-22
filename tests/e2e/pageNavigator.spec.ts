import { test, expect } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, uniqueName } from './helpers';

test('the page navigator rail shows only in fullscreen, tracks the active page, and disables prev/next at the bounds', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Page Navigator Doc'));
    await addPage(page);
    await addPage(page);
    await addPage(page);
    await assignActivePageImage(page);

    const ids = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });

    await expect(page.locator('.page-navigator')).toBeHidden();

    await page.locator('.canvas-mode-toggle').click();
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await page.locator('.fullscreen-close').waitFor({ state: 'visible' });

    const navigator = page.locator('.page-navigator');
    const counter = page.locator('.page-navigator-counter');
    const prevButton = page.locator('.page-navigator button[aria-label="Previous page"]');
    const nextButton = page.locator('.page-navigator button[aria-label="Next page"]');

    await expect(navigator).toBeVisible();
    await expect(counter).toHaveText('3/3');
    await expect(nextButton).toBeDisabled();
    await expect(prevButton).toBeEnabled();

    await prevButton.click();
    await prevButton.click();
    await expect(counter).toHaveText('1/3');
    await expect(prevButton).toBeDisabled();

    await page.locator(`.page-navigator-item[data-page-id="${ids[1]}"]`).click();
    await expect(counter).toHaveText('2/3');
    await expect(page.locator('.page-navigator-item.active')).toHaveAttribute('data-page-id', ids[1]!);
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', ids[1]!);

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('3/3');
    await expect(nextButton).toBeDisabled();

    await page.locator('.fullscreen-close').click();
    await expect(navigator).toBeHidden();
});

test('the page navigator auto-scrolls the active thumbnail into view when navigating past the visible range', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Page Navigator Scroll Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    for (let i = 0; i < 14; i++) {
        await addPage(page);
    }

    const ids = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });
    expect(ids).toHaveLength(15);

    await page.locator('.canvas-mode-toggle').click();
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await page.locator('.fullscreen-close').waitFor({ state: 'visible' });
    await expect(page.locator('.page-navigator-counter')).toHaveText('15/15');

    function isFirstItemVisible() {
        return page.evaluate(() => {
            const list = document.querySelector('.page-navigator-list');
            const firstItem = list?.querySelector('.page-navigator-item');
            if (!list || !firstItem) {
                return false;
            }
            const listRect = list.getBoundingClientRect();
            const itemRect = firstItem.getBoundingClientRect();
            return itemRect.top >= listRect.top && itemRect.bottom <= listRect.bottom;
        });
    }

    expect(await isFirstItemVisible()).toBe(false);

    for (let i = 0; i < 14; i++) {
        await page.keyboard.press('ArrowLeft');
    }
    await expect(page.locator('.page-navigator-counter')).toHaveText('1/15');
    await expect(page.locator('.page-navigator-item.active')).toHaveAttribute('data-page-id', ids[0]!);
    expect(await isFirstItemVisible()).toBe(true);
});
