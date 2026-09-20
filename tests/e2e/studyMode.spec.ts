import { test, expect } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, imageOnScreenRect, saveDocument, uniqueName } from './helpers';

async function switchToStudyMode(page: import('@playwright/test').Page): Promise<void> {
    await page.locator('.canvas-mode-toggle').click();
}

test('dragging over a hidden shape in study mode does not create, move, or resize anything', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Study Drag Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 40, y: imageRect.top + 30 }, { x: imageRect.left + 120, y: imageRect.top + 100 });

    await switchToStudyMode(page);
    await dragOnCanvas(page, { x: imageRect.left + 80, y: imageRect.top + 65 }, { x: imageRect.left + 150, y: imageRect.top + 150 });

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number; y: number; width: number; height: number; visible: boolean }[];

    expect(shapes).toHaveLength(1);
    expect(shapes[0].x).toBeCloseTo(40, 0);
    expect(shapes[0].y).toBeCloseTo(30, 0);
    expect(shapes[0].width).toBeCloseTo(80, 0);
    expect(shapes[0].height).toBeCloseTo(70, 0);
    expect(shapes[0].visible).toBe(true);
});

test('clicking a shape in study mode toggles it revealed, then clicking again hides it', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Study Toggle Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 40, y: imageRect.top + 30 }, { x: imageRect.left + 120, y: imageRect.top + 100 });
    await switchToStudyMode(page);

    await page.mouse.click(imageRect.left + 80, imageRect.top + 65);
    await saveDocument(page);
    let manifest = await fetchManifest(page, docId);
    expect((manifest.pages[0].shapes[0] as unknown as { visible: boolean }).visible).toBe(true);

    await page.mouse.click(imageRect.left + 80, imageRect.top + 65);
    await saveDocument(page);
    manifest = await fetchManifest(page, docId);
    expect((manifest.pages[0].shapes[0] as unknown as { visible: boolean }).visible).toBe(false);
});

test('Hide all and Reveal all set every shape on the current page', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Hide Reveal All Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 70, y: imageRect.top + 60 });
    await dragOnCanvas(page, { x: imageRect.left + 150, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 160 });

    await switchToStudyMode(page);
    await page.mouse.click(imageRect.left + 45, imageRect.top + 40);

    await page.getByRole('button', { name: 'Hide all' }).click();
    await saveDocument(page);
    let manifest = await fetchManifest(page, docId);
    let visibilities = (manifest.pages[0].shapes as unknown as { visible: boolean }[]).map(function v(s) { return s.visible; });
    expect(visibilities).toEqual([false, false]);

    await page.getByRole('button', { name: 'Reveal all' }).click();
    await saveDocument(page);
    manifest = await fetchManifest(page, docId);
    visibilities = (manifest.pages[0].shapes as unknown as { visible: boolean }[]).map(function v(s) { return s.visible; });
    expect(visibilities).toEqual([true, true]);
});
