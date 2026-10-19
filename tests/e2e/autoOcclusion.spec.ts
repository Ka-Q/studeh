import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, imageOnScreenRect, saveDocument, uniqueName } from './helpers';

// Two labels, "Femur shaft" (295, 70) and "Patella" (30, 192), each with a leader to an ellipse.
const LABELS_IMAGE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'labels.png');
const LABELS_IMAGE_SIZE = { width: 400, height: 260 };

type Box = { x: number; y: number; width: number; height: number };

async function savedShapes(page: Page, docId: string): Promise<Box[]> {
    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    return manifest.pages[0].shapes as unknown as Box[];
}

async function openLabelsPage(page: Page, label: string): Promise<string> {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName(label));
    await addPage(page);
    await assignActivePageImage(page, LABELS_IMAGE_PATH);
    return docId;
}

function covers(box: Box, x: number, y: number): boolean {
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

test('auto-occlude asks before replacing the page\'s occlusions, then covers each label with one', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Auto Occlude Doc');
    const imageRect = await imageOnScreenRect(page, LABELS_IMAGE_SIZE);
    await dragOnCanvas(page, { x: imageRect.left + 160, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 140 });

    await page.getByRole('button', { name: 'Auto-occlude' }).click();
    await expect(page.locator('#confirm-dialog-message')).toHaveText('This action will replace all pre-existing occlusions from the page. Do you want to continue?');
    await page.locator('#btn-confirm-delete').click();

    // The boxes are added once the analysis worker has found the labels.
    await expect.poll(async () => (await savedShapes(page, docId)).length).toBe(2);
    const shapes = await savedShapes(page, docId);
    expect(shapes.some((box) => covers(box, 300, 80) && covers(box, 385, 80))).toBe(true);
    expect(shapes.some((box) => covers(box, 35, 202) && covers(box, 85, 202))).toBe(true);
});

test('auto-occlude asks first even on a page without occlusions', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Auto Occlude Empty Doc');

    await page.getByRole('button', { name: 'Auto-occlude' }).click();
    await expect(page.locator('#confirm-dialog-message')).toHaveText('This action will replace all pre-existing occlusions from the page. Do you want to continue?');
    await page.locator('#btn-cancel-confirm').click();

    expect(await savedShapes(page, docId)).toHaveLength(0);
});

test('cancelling auto-occlude keeps the page\'s occlusions', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Auto Occlude Cancel Doc');
    const imageRect = await imageOnScreenRect(page, LABELS_IMAGE_SIZE);
    await dragOnCanvas(page, { x: imageRect.left + 160, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 140 });

    await page.getByRole('button', { name: 'Auto-occlude' }).click();
    await page.locator('#btn-cancel-confirm').click();

    expect(await savedShapes(page, docId)).toHaveLength(1);
});

test('clear occlusions asks, then removes every occlusion from the page', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Clear Occlusions Doc');
    const clearButton = page.getByRole('button', { name: 'Clear occlusions' });
    await expect(clearButton).toBeDisabled();
    const imageRect = await imageOnScreenRect(page, LABELS_IMAGE_SIZE);
    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 80, y: imageRect.top + 60 });
    await dragOnCanvas(page, { x: imageRect.left + 160, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 140 });

    await clearButton.click();
    await expect(page.locator('#confirm-dialog-message')).toHaveText('Remove all occlusions from this page?');
    await page.locator('#btn-confirm-delete').click();

    await expect(clearButton).toBeDisabled();
    expect(await savedShapes(page, docId)).toHaveLength(0);
});

test('a label written up the page is covered by a shape turned along it', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Auto Occlude Turned Doc'));
    await addPage(page);
    await assignActivePageImage(page, path.join(path.dirname(LABELS_IMAGE_PATH), 'label-vertical.png'));

    await page.getByRole('button', { name: 'Auto-occlude' }).click();
    await page.locator('#btn-confirm-delete').click();

    await expect.poll(async () => (await savedShapes(page, docId)).length).toBe(1);
    const [shape] = (await savedShapes(page, docId)) as (Box & { rotation?: number })[];
    expect(Math.abs(Math.abs(shape.rotation ?? 0) - 90)).toBeLessThan(5);
    expect(shape.x + shape.width / 2).toBeCloseTo(73, -1);
    expect(shape.y + shape.height / 2).toBeCloseTo(157, -1);
    expect(shape.width).toBeGreaterThan(140);
});
