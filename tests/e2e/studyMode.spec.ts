import { test, expect } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, getCanvas, imageOnScreenRect, isShapeRevealed, saveDocument, uniqueName } from './helpers';

async function toggleMode(page: import('@playwright/test').Page): Promise<void> {
    await page.locator('.canvas-mode-toggle').click();
}

test('dragging over a hidden shape in study mode does not create, move, or resize anything', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Study Drag Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 40, y: imageRect.top + 30 }, { x: imageRect.left + 120, y: imageRect.top + 100 });

    await toggleMode(page);
    const shapeCenter = { x: imageRect.left + 80, y: imageRect.top + 65 };
    await dragOnCanvas(page, shapeCenter, { x: imageRect.left + 150, y: imageRect.top + 150 });

    expect(await isShapeRevealed(page, shapeCenter)).toBe(true);

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    const shapes = manifest.pages[0].shapes as unknown as { x: number; y: number; width: number; height: number }[];

    expect(shapes).toHaveLength(1);
    expect(shapes[0].x).toBeCloseTo(40, 0);
    expect(shapes[0].y).toBeCloseTo(30, 0);
    expect(shapes[0].width).toBeCloseTo(80, 0);
    expect(shapes[0].height).toBeCloseTo(70, 0);
});

test('clicking a shape in study mode toggles it revealed, then clicking again hides it', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Study Toggle Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 40, y: imageRect.top + 30 }, { x: imageRect.left + 120, y: imageRect.top + 100 });
    await toggleMode(page);

    const shapeCenter = { x: imageRect.left + 80, y: imageRect.top + 65 };
    expect(await isShapeRevealed(page, shapeCenter)).toBe(false);

    await page.mouse.click(shapeCenter.x, shapeCenter.y);
    expect(await isShapeRevealed(page, shapeCenter)).toBe(true);

    await page.mouse.click(shapeCenter.x, shapeCenter.y);
    expect(await isShapeRevealed(page, shapeCenter)).toBe(false);
});

test('Hide all and Reveal all set every shape on the current page', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Hide Reveal All Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);

    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 70, y: imageRect.top + 60 });
    await dragOnCanvas(page, { x: imageRect.left + 150, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 160 });

    await toggleMode(page);
    const shapeOneCenter = { x: imageRect.left + 45, y: imageRect.top + 40 };
    const shapeTwoCenter = { x: imageRect.left + 175, y: imageRect.top + 130 };
    await page.mouse.click(shapeOneCenter.x, shapeOneCenter.y);

    await page.getByRole('button', { name: 'Hide all' }).click();
    expect(await isShapeRevealed(page, shapeOneCenter)).toBe(false);
    expect(await isShapeRevealed(page, shapeTwoCenter)).toBe(false);

    await page.getByRole('button', { name: 'Reveal all' }).click();
    expect(await isShapeRevealed(page, shapeOneCenter)).toBe(true);
    expect(await isShapeRevealed(page, shapeTwoCenter)).toBe(true);
});

test('revealed shapes are not persisted and reset to hidden each time Study Mode is entered', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Study Reset Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    await dragOnCanvas(page, { x: imageRect.left + 40, y: imageRect.top + 30 }, { x: imageRect.left + 120, y: imageRect.top + 100 });

    await toggleMode(page);
    const shapeCenter = { x: imageRect.left + 80, y: imageRect.top + 65 };
    await page.mouse.click(shapeCenter.x, shapeCenter.y);
    expect(await isShapeRevealed(page, shapeCenter)).toBe(true);

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    expect((manifest.pages[0].shapes[0] as unknown as { visible: boolean }).visible).toBe(false);

    await toggleMode(page); // back to edit
    await toggleMode(page); // re-enter study
    expect(await isShapeRevealed(page, shapeCenter)).toBe(false);
});

test('in study mode the cursor is a pointer over a shape and default elsewhere, grab only while holding the pan modifier', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Study Cursor Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    const canvas = getCanvas(page);

    await dragOnCanvas(page, { x: imageRect.left + 40, y: imageRect.top + 30 }, { x: imageRect.left + 120, y: imageRect.top + 100 });
    await toggleMode(page);

    await page.mouse.move(imageRect.left + 80, imageRect.top + 65);
    await expect(canvas).toHaveCSS('cursor', 'pointer');

    await page.mouse.move(imageRect.left + 200, imageRect.top + 200);
    await expect(canvas).toHaveCSS('cursor', 'default');

    await page.keyboard.down('Control');
    await expect(canvas).toHaveCSS('cursor', 'grab');
    await page.keyboard.up('Control');
    await expect(canvas).toHaveCSS('cursor', 'default');
});
