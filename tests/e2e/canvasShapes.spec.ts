import { test, expect } from '@playwright/test';
import { clampRectToBounds, handlePoints, resizeRect, type ResizeHandle } from '../../src/client/shapes/rectangle';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, getCanvas, imageOnScreenRect, saveDocument, TRANSPARENT_IMAGE_PATH, uniqueName } from './helpers';

test('drag-creating a rectangle in edit mode clamps it to the image bounds', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Shape Create Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    const imageRect = await imageOnScreenRect(page);
    await dragOnCanvas(
        page,
        { x: imageRect.left + 150, y: imageRect.top + 100 },
        { x: imageRect.left + 400, y: imageRect.top + 400 }
    );
    await expect(page.locator('#save-status')).toHaveText('Unsaved changes');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number; y: number; width: number; height: number }[];

    expect(shapes).toHaveLength(1);
    expect(shapes[0].x).toBeCloseTo(150, 0);
    expect(shapes[0].y).toBeCloseTo(100, 0);
    expect(shapes[0].width).toBeCloseTo(90, 0);
    expect(shapes[0].height).toBeCloseTo(80, 0);
});

test('clicking the topmost of two overlapping shapes selects it, not the one underneath', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Overlap Select Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 100, y: imageRect.top + 100 });
    await dragOnCanvas(page, { x: imageRect.left + 140, y: imageRect.top + 140 }, { x: imageRect.left + 60, y: imageRect.top + 60 });

    await page.mouse.click(imageRect.left + 80, imageRect.top + 80);
    await page.keyboard.press('Delete');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number }[];

    expect(shapes).toHaveLength(1);
    expect(shapes[0].x).toBeCloseTo(20, 0);
});

test('the buttons under a selected shape clone it (as does C) and delete it (as does X), selecting the shape selected before', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Clone Delete Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 100, y: imageRect.top + 100 });
    await page.locator('.shape-actions button[aria-label^="Clone"]').click();
    await page.keyboard.press('c');
    await page.keyboard.press('c');
    await page.locator('.shape-actions button[aria-label^="Delete"]').click();
    await page.keyboard.press('x');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number; y: number; width: number; height: number }[];

    // X only deletes a selected shape: the third clone going too shows the delete before it selected that clone.
    expect(shapes.map((shape) => [shape.x, shape.y, shape.width, shape.height])).toEqual([[20, 20, 80, 80], [32, 32, 80, 80]]);
});

test('deleting a newly drawn shape selects the shape selected before it was drawn', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Delete Drawn Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 60, y: imageRect.top + 60 });
    await dragOnCanvas(page, { x: imageRect.left + 100, y: imageRect.top + 20 }, { x: imageRect.left + 140, y: imageRect.top + 60 });
    await dragOnCanvas(page, { x: imageRect.left + 180, y: imageRect.top + 20 }, { x: imageRect.left + 220, y: imageRect.top + 60 });
    await page.keyboard.press('x');
    await page.keyboard.press('x');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number }[];

    expect(shapes.map((shape) => shape.x)).toEqual([20]);
});

test('dragging a selected shape by its body moves it without changing its size', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Move Shape Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 60, y: imageRect.top + 50 }, { x: imageRect.left + 130, y: imageRect.top + 110 });

    await dragOnCanvas(page, { x: imageRect.left + 95, y: imageRect.top + 80 }, { x: imageRect.left + 115, y: imageRect.top + 95 });

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number; y: number; width: number; height: number }[];

    expect(shapes).toHaveLength(1);
    expect(shapes[0].width).toBeCloseTo(70, 0);
    expect(shapes[0].height).toBeCloseTo(60, 0);
    expect(shapes[0].x).toBeCloseTo(80, 0);
    expect(shapes[0].y).toBeCloseTo(65, 0);
});

test('clicking a shape without moving it does not mark the document dirty', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('No-Op Click Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 40, y: imageRect.top + 30 }, { x: imageRect.left + 120, y: imageRect.top + 100 });
    await saveDocument(page);

    await page.mouse.click(imageRect.left + 80, imageRect.top + 65);

    // Neither plain textContent (stale once hidden — updateSaveStatus(false) only
    // removes the 'visible' class, it doesn't clear old text) nor '#save-status.visible'
    // alone (shared with the transient "Saved" confirmation from the save above) is
    // the right check — assert the element is never simultaneously visible and showing
    // the dirty message.
    await expect(page.locator('#save-status.visible', { hasText: 'Unsaved changes' })).toHaveCount(0);
});

test('resizing a selected shape from each of its 8 handles updates the corresponding edges', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Resize Handles Doc'));

    const initialRect = { x: 60, y: 50, width: 120, height: 80 };
    const delta = { x: 20, y: 15 };
    const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const expectedByHandle = new Map(handles.map(function toExpected(handle) {
        return [handle, clampRectToBounds(resizeRect(initialRect, handle, delta.x, delta.y), { width: 240, height: 180 })];
    }));

    for (const handle of handles) {
        await addPage(page);
        await assignActivePageImage(page);
        const imageRect = await imageOnScreenRect(page);

        await dragOnCanvas(
            page,
            { x: imageRect.left + initialRect.x, y: imageRect.top + initialRect.y },
            { x: imageRect.left + initialRect.x + initialRect.width, y: imageRect.top + initialRect.y + initialRect.height }
        );

        const handlePoint = handlePoints(initialRect).find(function matches(h) { return h.handle === handle; })!.point;
        await dragOnCanvas(
            page,
            { x: imageRect.left + handlePoint.x, y: imageRect.top + handlePoint.y },
            { x: imageRect.left + handlePoint.x + delta.x, y: imageRect.top + handlePoint.y + delta.y }
        );
    }

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);

    manifest.pages.forEach(function assertPage(pageDoc, index) {
        const handle = handles[index];
        const expected = expectedByHandle.get(handle)!;
        const shape = (pageDoc.shapes as unknown as { x: number; y: number; width: number; height: number }[])[0];
        expect(shape.x, `handle ${handle} x`).toBeCloseTo(expected.x, 0);
        expect(shape.y, `handle ${handle} y`).toBeCloseTo(expected.y, 0);
        expect(shape.width, `handle ${handle} width`).toBeCloseTo(expected.width, 0);
        expect(shape.height, `handle ${handle} height`).toBeCloseTo(expected.height, 0);
    });
});

test('dragging the handle above a selected shape rotates it, in 45° steps with Shift, and the rotated outline is what a click hits', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Rotate Shape Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 60, y: imageRect.top + 50 }, { x: imageRect.left + 180, y: imageRect.top + 130 });
    await page.keyboard.down('Shift');
    await dragOnCanvas(page, { x: imageRect.left + 120, y: imageRect.top + 26 }, { x: imageRect.left + 200, y: imageRect.top + 95 });
    await page.keyboard.up('Shift');
    // Turned a quarter, the shape spans y 30–150 about its centre (120, 90): y 140 is only inside the rotated outline.
    await dragOnCanvas(page, { x: imageRect.left + 120, y: imageRect.top + 140 }, { x: imageRect.left + 130, y: imageRect.top + 140 });

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number; y: number; width: number; height: number; rotation?: number }[];

    expect(shapes).toHaveLength(1);
    expect(shapes[0].rotation).toBe(90);
    expect([shapes[0].x, shapes[0].y, shapes[0].width, shapes[0].height]).toEqual([70, 50, 120, 80]);
});

test('transparent areas of a page image show as white', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Transparent Image Doc'));
    await addPage(page);
    await assignActivePageImage(page, TRANSPARENT_IMAGE_PATH);
    const imageRect = await imageOnScreenRect(page);
    const center = { x: imageRect.left + imageRect.width / 2, y: imageRect.top + imageRect.height / 2 };

    await expect.poll(() => getCanvas(page).evaluate(function readPixel(canvas: HTMLCanvasElement, target: { x: number; y: number }) {
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const pixel = canvas.getContext('2d')!.getImageData(Math.round((target.x - rect.left) * scale), Math.round((target.y - rect.top) * scale), 1, 1).data;
        return Array.from(pixel);
    }, center)).toEqual([255, 255, 255, 255]);
});

test('Ctrl+clicking shapes adds them to the selection or takes them out, and X deletes every selected shape', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Multi Select Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    for (const left of [10, 60, 110]) {
        await dragOnCanvas(page, { x: imageRect.left + left, y: imageRect.top + 10 }, { x: imageRect.left + left + 40, y: imageRect.top + 50 });
    }
    await page.keyboard.down('ControlOrMeta');
    for (const left of [30, 80, 130]) {
        await page.mouse.click(imageRect.left + left, imageRect.top + 30);
    }
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.press('x');

    await saveDocument(page);
    let manifest = await fetchManifest(page, docId);
    expect((manifest.pages[0].shapes as unknown as { x: number }[]).map((shape) => shape.x)).toEqual([110]);

    // The selection before the deleted one held the third shape too: it is what is selected now.
    await getCanvas(page).focus();
    await page.keyboard.press('x');
    await saveDocument(page);
    manifest = await fetchManifest(page, docId);
    expect(manifest.pages[0].shapes).toHaveLength(0);
});

test('Ctrl+dragging selects the shapes it touches; dragging one moves them all and C clones them all', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Marquee Select Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    for (const left of [10, 60, 110]) {
        await dragOnCanvas(page, { x: imageRect.left + left, y: imageRect.top + 10 }, { x: imageRect.left + left + 40, y: imageRect.top + 50 });
    }
    await page.mouse.click(imageRect.left + 200, imageRect.top + 150);
    await page.keyboard.down('ControlOrMeta');
    await dragOnCanvas(page, { x: imageRect.left + 5, y: imageRect.top + 30 }, { x: imageRect.left + 70, y: imageRect.top + 60 });
    await page.keyboard.up('ControlOrMeta');
    await dragOnCanvas(page, { x: imageRect.left + 30, y: imageRect.top + 30 }, { x: imageRect.left + 30, y: imageRect.top + 80 });
    await page.keyboard.press('c');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number; y: number }[];

    expect(shapes.map((shape) => [shape.x, shape.y])).toEqual([[10, 60], [60, 60], [110, 10], [22, 72], [72, 72]]);
});

test('rotating one of several selected shapes turns each about its own centre; a click on one then selects it alone', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Multi Rotate Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 70 }, { x: imageRect.left + 60, y: imageRect.top + 90 });
    await dragOnCanvas(page, { x: imageRect.left + 100, y: imageRect.top + 70 }, { x: imageRect.left + 140, y: imageRect.top + 90 });
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.click(imageRect.left + 40, imageRect.top + 80);
    await page.keyboard.up('ControlOrMeta');
    // The first shape, selected last, has the rotation handle: 24 px above its top edge's middle.
    await page.keyboard.down('Shift');
    await dragOnCanvas(page, { x: imageRect.left + 40, y: imageRect.top + 46 }, { x: imageRect.left + 100, y: imageRect.top + 80 });
    await page.keyboard.up('Shift');
    await page.mouse.click(imageRect.left + 40, imageRect.top + 80);
    await page.keyboard.press('x');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number; y: number; width: number; height: number; rotation?: number }[];

    expect(shapes).toHaveLength(1);
    expect([shapes[0].x, shapes[0].y, shapes[0].width, shapes[0].height, shapes[0].rotation]).toEqual([100, 70, 40, 20, 90]);
});

test('Escape unselects every selected shape', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Escape Unselect Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 10, y: imageRect.top + 10 }, { x: imageRect.left + 50, y: imageRect.top + 50 });
    await dragOnCanvas(page, { x: imageRect.left + 60, y: imageRect.top + 10 }, { x: imageRect.left + 100, y: imageRect.top + 50 });
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.click(imageRect.left + 30, imageRect.top + 30);
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.press('Escape');
    await expect(page.locator('.shape-actions')).toBeHidden();
    await page.keyboard.press('x');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    expect(manifest.pages[0].shapes).toHaveLength(2);
});

test('the Colour button colours the selected shapes from a typed value or a recent colour, and the colour is saved', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Shape Colour Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 100, y: imageRect.top + 100 });
    await page.locator('.shape-actions button[aria-label="Colour"]').click();
    const hexField = page.getByLabel('Colour as hex or rgb()');

    await hexField.fill('nonsense');
    await hexField.press('Enter');
    await expect(hexField).toHaveAttribute('aria-invalid', '');
    await expect(page.getByRole('alert')).toBeVisible();

    await hexField.fill('rgb(255, 0, 16)');
    await hexField.press('Enter');
    await expect(page.getByLabel(/^Recent colour/)).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.locator('.shape-actions button[aria-label="Colour"]').click();
    await hexField.fill('#0A0');
    await hexField.press('Enter');
    await page.keyboard.press('Escape');

    await page.locator('.shape-actions button[aria-label="Colour"]').click();
    await expect(page.getByLabel(/^Recent colour/)).toHaveCount(2);
    await page.getByLabel('Recent colour #ff0010').click();
    await page.keyboard.press('Escape');

    await dragOnCanvas(page, { x: imageRect.left + 120, y: imageRect.top + 20 }, { x: imageRect.left + 200, y: imageRect.top + 100 });
    await page.locator('.shape-actions button[aria-label="Colour"]').click();
    await hexField.fill('#00aa00');
    await hexField.press('Enter');
    await page.getByLabel('Default colour').click();
    await page.keyboard.press('Escape');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { color?: string }[];

    expect(shapes.map((shape) => shape.color)).toEqual(['#ff0010', undefined]);
});
