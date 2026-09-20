import { test, expect } from '@playwright/test';
import { clampRectToBounds, handlePoints, resizeRect, type ResizeHandle } from '../../src/client/shapes/rectangle';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, imageOnScreenRect, saveDocument, uniqueName } from './helpers';

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
