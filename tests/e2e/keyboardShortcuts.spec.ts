import { test, expect } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, imageOnScreenRect, isShapeRevealed, uniqueName } from './helpers';

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

test('sidebar/toolbar shortcuts do not fire in fullscreen; canvas-scoped shortcuts still do', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Fullscreen Gating Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    await page.locator('.canvas-mode-toggle').click();
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await page.locator('.fullscreen-close').waitFor({ state: 'visible' });

    await page.keyboard.press('Control+d');
    await expect(page.locator('#new-document-dialog[open]')).toHaveCount(0);

    await page.keyboard.press('h');
    await expect(page.locator('.canvas-hints')).toHaveClass(/collapsed/);

    await page.keyboard.press('f');
    await expect(page.locator('.fullscreen-close')).toBeHidden();
});

test(',/. trigger Reveal all/Hide all regardless of Shift state, and only in study mode', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Reveal Hide Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 70, y: imageRect.top + 60 });
    const shapeCenter = { x: imageRect.left + 45, y: imageRect.top + 40 };

    async function dispatchKey(key: string, shiftKey: boolean): Promise<void> {
        await page.evaluate(function dispatch(options) {
            document.dispatchEvent(new KeyboardEvent('keydown', { ...options, bubbles: true }));
        }, { key, shiftKey });
    }

    // Blocked outside study mode: dispatched while still in edit mode, where reveal
    // state isn't even rendered — checked below, right after entering study mode.
    await dispatchKey(',', false);

    await page.locator('.canvas-mode-toggle').click();
    expect(await isShapeRevealed(page, shapeCenter)).toBe(false);

    // Comma reveals, whether or not Shift happens to be held for it on this layout.
    await dispatchKey(',', true);
    expect(await isShapeRevealed(page, shapeCenter)).toBe(true);

    // Period hides, likewise regardless of Shift state.
    await dispatchKey('.', false);
    expect(await isShapeRevealed(page, shapeCenter)).toBe(false);
});

test('"=" triggers Fit to view regardless of which physical key or Shift state produces it', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Fit To View Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    const percent = page.locator('.canvas-zoom-percent');
    const pristinePercent = await percent.textContent();

    async function dispatchKey(key: string, code: string, shiftKey: boolean): Promise<void> {
        await page.evaluate(function dispatch(options) {
            document.dispatchEvent(new KeyboardEvent('keydown', { ...options, bubbles: true }));
        }, { key, code, shiftKey });
    }

    await page.locator('.canvas-zoom button[aria-label="Zoom in"]').click();
    await expect(percent).not.toHaveText(pristinePercent ?? '');
    // US layout: the bare (unshifted) Equal key already produces '='.
    await dispatchKey('=', 'Equal', false);
    await expect(percent).toHaveText(pristinePercent ?? '');

    await page.locator('.canvas-zoom button[aria-label="Zoom in"]').click();
    await expect(percent).not.toHaveText(pristinePercent ?? '');
    // Nordic layout: '=' is Shift+0 instead, a different physical code entirely.
    await dispatchKey('=', 'Digit0', true);
    await expect(percent).toHaveText(pristinePercent ?? '');
});

test('+/- zoom shortcuts fire on whatever physical key/Shift-state actually produces the symbol', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Zoom Plus Minus Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    const percent = page.locator('.canvas-zoom-percent');
    await expect(percent).toHaveText('100');

    async function dispatchKey(key: string, code: string, shiftKey: boolean): Promise<void> {
        await page.evaluate(function dispatch(options) {
            document.dispatchEvent(new KeyboardEvent('keydown', { ...options, bubbles: true }));
        }, { key, code, shiftKey });
    }

    // US layout: '+' requires Shift held on the Equal-code key.
    await dispatchKey('+', 'Equal', true);
    await expect(percent).toHaveText('110');

    // Nordic layout: '+' is unshifted, and on a different physical code entirely.
    await dispatchKey('+', 'Minus', false);
    await expect(percent).toHaveText('120');

    // US layout: '-' is the bare (unshifted) Minus-code key.
    await dispatchKey('-', 'Minus', false);
    await expect(percent).toHaveText('110');
});

test('a symbol shortcut still fires when the layout requires AltGr to produce it', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('AltGr Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    const percent = page.locator('.canvas-zoom-percent');
    await expect(percent).toHaveText('100');

    // Some layouts gate '+' behind AltGr, which browsers report as Ctrl+Alt
    // on Windows/Linux (modifierAltGraph makes getModifierState('AltGraph') true).
    await page.evaluate(function dispatchAltGrPlus() {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: '+',
            ctrlKey: true,
            altKey: true,
            modifierAltGraph: true,
            bubbles: true
        }));
    });
    await expect(percent).toHaveText('110');
});

test('Tab cycles shape focus in fullscreen study mode; Enter toggles the focused shape, Shift+Tab cycles backward', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Focus Cycle Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 60, y: imageRect.top + 50 });
    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 120 }, { x: imageRect.left + 60, y: imageRect.top + 150 });

    await page.locator('.canvas-mode-toggle').click();
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await page.locator('.fullscreen-close').waitFor({ state: 'visible' });

    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');

    await page.locator('.fullscreen-close').click();
    await page.locator('.fullscreen-close').waitFor({ state: 'hidden' });
    const shapeOneCenter = { x: imageRect.left + 40, y: imageRect.top + 35 };
    const shapeTwoCenter = { x: imageRect.left + 40, y: imageRect.top + 135 };
    expect(await isShapeRevealed(page, shapeOneCenter)).toBe(false);
    expect(await isShapeRevealed(page, shapeTwoCenter)).toBe(true);
});

test('navigating to an imageless page in fullscreen leaves no stale shape-focus shortcut behind', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Stale Focus Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 60, y: imageRect.top + 50 });
    await addPage(page);
    await page.locator('.page-item').first().locator('.page-thumb').click();

    await page.locator('.canvas-mode-toggle').click();
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await page.locator('.fullscreen-close').waitFor({ state: 'visible' });

    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await page.locator('.fullscreen-close').click();
    await page.locator('.fullscreen-close').waitFor({ state: 'hidden' });
    await page.locator('.page-item').first().locator('.page-thumb').click();
    const shapeCenter = { x: imageRect.left + 40, y: imageRect.top + 35 };
    expect(await isShapeRevealed(page, shapeCenter)).toBe(false);
});

test('plain arrow-key page navigation still works in fullscreen', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Fullscreen Nav Doc'));
    await addPage(page);
    await addPage(page);
    await assignActivePageImage(page);
    const ids = await page.locator('.page-item').evaluateAll(function toIds(items) {
        return items.map(function id(item) { return item.getAttribute('data-page-id'); });
    });
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', ids[1]!);

    await page.locator('.canvas-mode-toggle').click();
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await page.locator('.fullscreen-close').waitFor({ state: 'visible' });

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', ids[0]!);

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.page-item.active')).toHaveAttribute('data-page-id', ids[1]!);
});
