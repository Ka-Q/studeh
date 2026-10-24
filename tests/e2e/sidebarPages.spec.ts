import { test, expect, type Page } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, uniqueName } from './helpers';

test('Add page appends a new page and selects it', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Add Page Doc'));

    await addPage(page);

    await expect(page.locator('.page-item')).toHaveCount(1);
    await expect(page.locator('.page-item.active')).toHaveCount(1);
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');
});

test('Deleting the active page removes it and reassigns the active page', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Delete Page Doc'));

    await addPage(page);
    await addPage(page);
    await expect(page.locator('.page-item')).toHaveCount(2);

    const firstPageId = await page.locator('.page-item').nth(0).getAttribute('data-page-id');
    const secondPageId = await page.locator('.page-item').nth(1).getAttribute('data-page-id');
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', secondPageId!);

    await page.locator('.page-item.active').getByRole('button', { name: /Delete page/ }).click();

    await expect(page.locator('.page-item')).toHaveCount(1);
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', firstPageId!);
});

async function isActivePageVisibleInList(page: Page): Promise<boolean> {
    return page.evaluate(function isInView() {
        const list = document.getElementById('page-list')!.getBoundingClientRect();
        const item = document.querySelector('#page-list .page-item.active')!.getBoundingClientRect();
        return item.top >= list.top - 1 && item.bottom <= list.bottom + 1;
    });
}

test('the sidebar list scrolls to follow the active page when it changes or is moved', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 500 });
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Follow Doc'));
    for (let count = 0; count < 12; count++) {
        await addPage(page);
    }
    await expect.poll(() => isActivePageVisibleInList(page)).toBe(true);

    await page.locator('.page-item').first().locator('.page-thumb').click();
    await expect.poll(() => isActivePageVisibleInList(page)).toBe(true);

    for (let step = 0; step < 11; step++) {
        await page.keyboard.press('ControlOrMeta+Shift+ArrowDown');
    }
    await expect.poll(() => isActivePageVisibleInList(page)).toBe(true);
});

test('reordering pages keeps each page thumbnail element rather than loading it again', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Thumb Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    await addPage(page);
    await assignActivePageImage(page);
    await page.evaluate(() => document.querySelector('#page-list .page-item .page-thumb')!.setAttribute('data-kept', 'yes'));

    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp');

    await expect(page.locator('#page-list .page-thumb[data-kept="yes"]')).toHaveCount(1);
});

test('moving through pages with the keyboard keeps a few pages beyond the active one in view', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Buffer Doc'));
    for (let count = 0; count < 12; count++) {
        await addPage(page);
    }
    for (let step = 0; step < 6; step++) {
        await page.keyboard.press('ControlOrMeta+ArrowUp');
    }

    await expect.poll(() => page.evaluate(function pagesAboveActive() {
        const list = document.getElementById('page-list')!;
        const item = document.querySelector('#page-list .page-item.active') as HTMLElement;
        return Math.floor((item.getBoundingClientRect().top - list.getBoundingClientRect().top) / item.offsetHeight);
    })).toBeGreaterThanOrEqual(2);
});

test('moving a page with its button from the keyboard keeps the keyboard focus on that button', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Focus Doc'));
    for (let count = 0; count < 4; count++) {
        await addPage(page);
    }
    const moveUp = page.locator('#page-list .page-item').nth(2).getByRole('button', { name: /^Move page up/ });
    await moveUp.focus();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');

    await expect(page.locator('#page-list .page-item').first().getByRole('button', { name: /^Move page up/ })).toBeDisabled();
    await expect(page.locator('#page-list .page-item:focus-within')).toHaveCount(1);
    expect(await page.evaluate(() => document.activeElement?.closest('.page-item')?.querySelector('.page-name')?.textContent)).toBe('Page 3');
});

async function dragPage(page: Page, fromIndex: number, toIndex: number, options: { release: boolean } = { release: true }): Promise<void> {
    const items = page.locator('#page-list .page-item');
    const from = (await items.nth(fromIndex).locator('.page-thumb').boundingBox())!;
    const to = (await items.nth(toIndex).locator('.page-thumb').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, (from.y + to.y) / 2, { steps: 4 });
    // Past the target's middle, which is where a dragged page passes it.
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + Math.sign(toIndex - fromIndex) * to.height / 2, { steps: 4 });
    if (options.release) {
        await page.mouse.up();
    }
}

test('dragging a page row to another place reorders the pages as one undoable step and keeps the active page', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Drag Doc'));
    for (let count = 0; count < 4; count++) {
        await addPage(page);
    }
    const names = () => page.locator('#page-list .page-name').allTextContents();
    const initial = await names();

    await dragPage(page, 0, 3);

    expect(await names()).toEqual([initial[1], initial[2], initial[3], initial[0]]);
    await expect(page.locator('#page-list .page-item.active .page-name')).toHaveText(initial[3]);
    await expect(page.locator('#page-list .page-item.dragging')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+z');

    expect(await names()).toEqual(initial);
    await expect(page.locator('#page-list .page-item.active .page-name')).toHaveText(initial[3]);
});

test('Escape during a drag puts the pages back, and a short press on a page just selects it', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Drag Cancel Doc'));
    for (let count = 0; count < 3; count++) {
        await addPage(page);
    }
    const names = () => page.locator('#page-list .page-name').allTextContents();
    const initial = await names();

    await dragPage(page, 0, 2, { release: false });
    expect(await names()).toEqual([initial[1], initial[2], initial[0]]);
    // Past the moment the list finishes resting from any earlier button moves: the dragged page stays above the others.
    await page.waitForTimeout(300);
    const isDraggedPageOnTop = await page.evaluate(function isUnderPointerOnTop() {
        const dragged = document.querySelector('#page-list .page-item.dragging')!.getBoundingClientRect();
        const topmost = document.elementFromPoint(dragged.left + 60, dragged.top + dragged.height / 2);
        return topmost?.closest('.page-item')?.classList.contains('dragging');
    });
    expect(isDraggedPageOnTop).toBe(true);
    await page.keyboard.press('Escape');
    await page.mouse.up();

    expect(await names()).toEqual(initial);
    await expect(page.locator('#page-list .page-item.dragging')).toHaveCount(0);

    // A click this soon after a drag is the drag's own release, which doesn't select a page.
    await page.waitForTimeout(400);
    await page.locator('#page-list .page-item').nth(1).locator('.page-thumb').click();
    await expect(page.locator('#page-list .page-item.active .page-name')).toHaveText(initial[1]);
    expect(await names()).toEqual(initial);
});

test('a page can be dragged by its action buttons too, without pressing them', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Drag Buttons Doc'));
    for (let count = 0; count < 3; count++) {
        await addPage(page);
    }
    const names = () => page.locator('#page-list .page-name').allTextContents();
    const initial = await names();
    const items = page.locator('#page-list .page-item');
    await items.first().hover();
    const button = (await items.first().getByRole('button', { name: /^Move page down/ }).boundingBox())!;
    const target = (await items.nth(2).boundingBox())!;

    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await page.mouse.move(button.x + button.width / 2, target.y + target.height, { steps: 8 });
    await page.mouse.up();

    expect(await names()).toEqual([initial[1], initial[2], initial[0]]);
});

test('moving a page with its button makes it the active page and keeps the pages around it in view', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Button Doc'));
    for (let count = 0; count < 12; count++) {
        await addPage(page);
    }
    const names = () => page.locator('#page-list .page-name').allTextContents();
    await page.locator('#page-list .page-item').first().locator('.page-thumb').click();
    const initial = await names();
    const second = page.locator('#page-list .page-item').nth(1);

    await second.getByRole('button', { name: /^Move page up/ }).click();

    expect(await names()).toEqual([initial[1], initial[0], ...initial.slice(2)]);
    await expect(page.locator('#page-list .page-item.active .page-name')).toHaveText(initial[1]);
    await expect.poll(() => page.evaluate(function isFirstPageInView() {
        const list = document.getElementById('page-list')!.getBoundingClientRect();
        return document.querySelector('#page-list .page-item')!.getBoundingClientRect().top >= list.top - 1;
    })).toBe(true);
});

test('a page with an image can be dragged by its thumbnail without the browser dragging the image', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Drag Image Doc'));
    for (let count = 0; count < 3; count++) {
        await addPage(page);
        await assignActivePageImage(page);
    }
    const names = () => page.locator('#page-list .page-name').allTextContents();
    const initial = await names();

    await dragPage(page, 0, 2);

    expect(await names()).toEqual([initial[1], initial[2], initial[0]]);
    await expect(page.locator('#page-list .page-item.dragging')).toHaveCount(0);
});

test('a page shows its select checkbox only on hover or focus, unless it is selected', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Sidebar Checkbox Doc'));
    await addPage(page);
    await addPage(page);
    const checkboxOpacity = (index: number) => page.locator('#page-list .page-item').nth(index).locator('.page-select-checkbox')
        .evaluate((checkbox) => getComputedStyle(checkbox).opacity);
    await page.mouse.move(600, 600);

    await expect.poll(() => checkboxOpacity(0)).toBe('0');

    await page.locator('#page-list .page-item').nth(0).hover();
    await expect.poll(() => checkboxOpacity(0)).toBe('1');
    await page.locator('#page-list .page-item').nth(0).locator('.page-select-checkbox').check();
    await page.mouse.move(600, 600);

    await expect.poll(() => checkboxOpacity(0)).toBe('1');
    await expect.poll(() => checkboxOpacity(1)).toBe('0');
});
